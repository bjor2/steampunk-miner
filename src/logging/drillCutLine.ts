/**
 * The `drill_cut` line of a drill span (ticket 420, the TD spec on #396 with the GD ruling; ticket
 * 335 wrote one per `drillStep` tick). A span is a run of one player's drill commands: their
 * per-cell `TileDestroyed`, `CargoAdded`, `DrillDamageDealt` and `CasingPlaced` (which stay per
 * cell as domain events) fold into one line, and their `CasingLined` into one `casing_lined` line
 * per (band, grade, type) run with the lengths and prices summed exactly. Adding to a span is
 * O(1), counts, sums and one run-length tail, so the bytes and work per tick stay the same at any
 * number of cells a tick. When a span breaks is `spanBreakOf` here; who closes it is the writer
 * (`drillSpanWriter.ts`).
 */
import { DRILL_SPAN_CAP_TICKS } from '../constants/runLog'
import type { CommandStamp } from '../systems/authority/authorityCommand'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { add, fromCanonical, toCanonical, ZERO_MONEY, type Money } from '../systems/money'
import type { DRILL_SPAN_STOPS, RunEventData } from './eventNames'
import { extendMinedRuns, type MinedRun } from './minedOrder'
import type { RunEventStamp } from './runEvent'

export type DrillSpanStop = (typeof DRILL_SPAN_STOPS)[number]

/** The vehicle's energy in quanta and heat in units, read for a span's net change (GD Q1). */
export interface SpanReading {
  energy: number
  heat: number
}

const SPAN_EVENT_TYPES = [
  'TileDestroyed',
  'CargoAdded',
  'DrillDamageDealt',
  'CasingPlaced',
  'CasingLined',
] as const

type SpanEventType = (typeof SPAN_EVENT_TYPES)[number]
/** A drill command caused it, so it carries that command's stamp. */
type SpanDomainEvent<K extends SpanEventType = SpanEventType> = Extract<DomainEvent, { type: K }> &
  CommandStamp

/** A folded event, the stamp its own line would have had and the band of its cell, if any. */
export interface SpanEvent<K extends SpanEventType = SpanEventType> {
  event: SpanDomainEvent<K>
  stamp: RunEventStamp
  /** The band of a broken cell; null for every other event, or with no planet to read. */
  band: number | null
}

type Cell = readonly [tx: number, ty: number]

interface LastOre {
  depthTiles: number
  chunk: string
  tick: number
}

interface LiningRun {
  stamp: RunEventStamp
  band: number
  grade: number
  liningType: string
  lengthMm: number
  price: Money
  rings: number
}

export interface DrillSpan {
  /** The first broken cell's stamp, or the first event's while none broke. */
  stamp: RunEventStamp
  openTick: number
  /** The band of its broken cells, once one broke and the planet could be read. */
  band: number | null
  deepestTiles: number
  spans: number
  lastSeq: number | undefined
  cells: number
  first: Cell | null
  last: Cell | null
  ticks: number
  units: number
  value: Money
  ores: MinedRun[]
  lastOre: LastOre | null
  lining: LiningRun | null
  opening: SpanReading | null
  closing: SpanReading | null
}

/** A domain event a drill command caused that a span folds: a cell's dig, break, unit or ring. */
export function isSpanEventType(event: DomainEvent): boolean {
  const isSpanType = (SPAN_EVENT_TYPES as readonly string[]).includes(event.type)
  return isSpanType && !(event.type === 'TileDestroyed' && event.cause !== undefined)
}

export function openDrillSpan(first: SpanEvent, opening: SpanReading | null): DrillSpan {
  return {
    stamp: first.stamp,
    openTick: first.event.tick,
    band: null,
    deepestTiles: first.stamp.depthTiles,
    spans: 0,
    lastSeq: undefined,
    cells: 0,
    first: null,
    last: null,
    ticks: 0,
    units: 0,
    value: ZERO_MONEY,
    ores: [],
    lastOre: null,
    lining: null,
    opening,
    closing: opening,
  }
}

/** Why `next` cannot join `span`: its 5 s are up, or `next` is in another band or lining run. */
export function spanBreakOf(span: DrillSpan, next: SpanEvent): DrillSpanStop | null {
  if (next.event.tick - span.openTick >= DRILL_SPAN_CAP_TICKS) return 'cap'
  if (isOtherBand(span, next) || isOtherLiningRun(span.lining, next.event)) return 'band'
  return null
}

function isOtherBand(span: DrillSpan, { event, band }: SpanEvent): boolean {
  if (event.type !== 'TileDestroyed' || span.band === null || band === null) return false
  return band !== span.band
}

function isOtherLiningRun(lining: LiningRun | null, event: SpanDomainEvent): boolean {
  if (event.type !== 'CasingLined' || lining === null) return false
  const isSameRun =
    lining.band === event.band &&
    lining.grade === event.grade &&
    lining.liningType === event.liningType
  return !isSameRun
}

/** Adds `next` to `span` in place. */
export function foldIntoSpan(span: DrillSpan, next: SpanEvent): void {
  countCommand(span, next.event)
  span.deepestTiles = Math.max(span.deepestTiles, next.stamp.depthTiles)
  const fold = SPAN_FOLDS[next.event.type] as SpanFold<SpanEventType>
  fold(span, next)
}

function countCommand(span: DrillSpan, event: SpanDomainEvent): void {
  if (event.seq === span.lastSeq) return
  span.spans += 1
  span.lastSeq = event.seq
}

type SpanFold<K extends SpanEventType> = (span: DrillSpan, next: SpanEvent<K>) => void

const SPAN_FOLDS: { readonly [K in SpanEventType]: SpanFold<K> } = {
  TileDestroyed: foldBrokenCell,
  CargoAdded: (span, { event }) => {
    span.units += event.amount
    span.value = add(span.value, fromCanonical(event.value))
    extendMinedRuns(span.ores, event.oreId, event.amount)
    span.lastOre = { depthTiles: event.depthTiles, chunk: event.chunk, tick: event.tick }
  },
  DrillDamageDealt: (span, { event }) => {
    span.ticks += event.ticks
  },
  // A ring the drill laid: its lining charge, if any, is the `CasingLined` beside it.
  CasingPlaced: () => undefined,
  CasingLined: foldLinedRing,
}

function foldBrokenCell(span: DrillSpan, { event, stamp, band }: SpanEvent<'TileDestroyed'>) {
  const cell: Cell = [event.tx, event.ty]
  if (span.cells === 0) {
    span.stamp = stamp
    span.first = cell
    span.band = band
  }
  span.cells += 1
  span.last = cell
}

function foldLinedRing(span: DrillSpan, { event, stamp }: SpanEvent<'CasingLined'>): void {
  span.lining ??= {
    stamp,
    band: event.band,
    grade: event.grade,
    liningType: event.liningType,
    lengthMm: 0,
    price: ZERO_MONEY,
    rings: 0,
  }
  span.lining.lengthMm += event.lengthMm
  span.lining.price = add(span.lining.price, fromCanonical(event.price))
  span.lining.rings += 1
}

/** The span's line stamp: its first broken cell, as deep as the span went. */
export function drillCutStampOf(span: DrillSpan): RunEventStamp {
  return { ...span.stamp, depthTiles: span.deepestTiles }
}

export function drillCutDataOf(span: DrillSpan, stop: DrillSpanStop): RunEventData<'drill_cut'> {
  return {
    spans: span.spans,
    cells: span.cells,
    ...cellFieldsOf(span),
    ticks: span.ticks,
    units: span.units,
    value: toCanonical(span.value),
    ores: span.ores,
    ...netChangeOf(span.opening, span.closing),
    stop,
    ...lastOreFieldsOf(span.lastOre),
  }
}

function cellFieldsOf({ first, last }: DrillSpan): { first?: Cell; last?: Cell } {
  return first === null || last === null ? {} : { first, last }
}

/** With no reading at either end, the change is not known and logs as none. */
function netChangeOf(opening: SpanReading | null, closing: SpanReading | null): SpanReading {
  if (opening === null || closing === null) return { energy: 0, heat: 0 }
  return { energy: closing.energy - opening.energy, heat: closing.heat - opening.heat }
}

function lastOreFieldsOf(lastOre: LastOre | null) {
  if (lastOre === null) return {}
  return {
    lastOreDepthTiles: lastOre.depthTiles,
    lastOreChunk: lastOre.chunk,
    lastOreTick: lastOre.tick,
  }
}

/** The span's lining run as one `casing_lined` line, at its first ring's stamp. */
export function casingLinedLineOf(lining: LiningRun): {
  stamp: RunEventStamp
  data: RunEventData<'casing_lined'>
} {
  const { stamp, band, grade, liningType, lengthMm, price, rings } = lining
  return {
    stamp,
    data: { lengthMm, band, grade, type: liningType, price: toCanonical(price), rings },
  }
}
