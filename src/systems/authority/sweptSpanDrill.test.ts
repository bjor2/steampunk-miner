import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { add, fromCanonical, toCanonical, ZERO_MONEY } from '../money'
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { ECONOMY } from '../economy/economy'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { cellDensitySum } from '../world/cellYield'
import type { TilePoint } from '../world/tileGrid'
import { EMPTY_WORLD } from '../world/worldState'
import { vehicleOf, type AuthorityState } from './authorityState'
import { toCanonicalJson } from './canonicalJson'
import { cellDigEnergyOf } from './cellDigEnergy'
import type { RuleEffect } from './commandRule'
import type { DomainEventBody } from './domainEvent'
import { FLOOR, HEAT_PARAMS } from './lava/lavaFixtures'
import { drillAlongSweep } from './sweptDrill'
import { drillAlongSpan, type SpanCut } from './sweptSpanDrill'
import {
  CACHE,
  cacheSweep,
  chunkCornerSweep,
  chunksChangedIn,
  coreSweep,
  ELECTRIFIED,
  fullHoldSweep,
  gearedCornerSweep,
  lavaSweep,
  RIM_GATE,
  STOP_GATE,
  sweepWith,
  type SweepFixture,
} from './sweptSpanFixtures'

// The swept span's reference test (ticket 374, the TD lock on #374): today's per-cell carve
// (`drillAlongSweep`, the stamp walked in rows) is the source of truth, and the span, forced on
// every tick, must answer the same state and event log byte for byte. Both run from the same start,
// a tick at a time, as `drillStep` cuts them.

interface TickRecord {
  state: AuthorityState
  events: DomainEventBody[]
}

const asRecord = ({ state, events }: RuleEffect): TickRecord => ({ state, events })

/** The per-cell reference's ticks; the span's must be the same canonical JSON, state and events. */
function expectSpanMatchesPerCell(fixture: SweepFixture): TickRecord[] {
  return withRegistrations(fixture.slices, () => {
    const reference = sweepWith(fixture, drillAlongSweep, (effect) => effect).map(asRecord)
    const span = sweepWith(fixture, drillAlongSpan, ({ effect }) => effect)
    const canonicalOf = (record: TickRecord) => toCanonicalJson(record)
    expect(span.map(({ effect }) => canonicalOf(asRecord(effect)))).toEqual(
      reference.map(canonicalOf),
    )
    return reference
  })
}

function spanCutsOf(fixture: SweepFixture): SpanCut[] {
  return withRegistrations(fixture.slices, () =>
    sweepWith(fixture, drillAlongSpan, ({ effect }) => effect),
  )
}

const eventsOf = (records: readonly TickRecord[]) => records.flatMap(({ events }) => events)
const isAt = (event: DomainEventBody, { tx, ty }: TilePoint) =>
  'tx' in event && event.tx === tx && event.ty === ty

function isDestroyedAt(event: DomainEventBody, tile: TilePoint): boolean {
  return event.type === 'TileDestroyed' && isAt(event, tile)
}

function isGatedAt(event: DomainEventBody, tile: TilePoint): boolean {
  return event.type === 'DrillGated' && event.outcome === 'refused' && isAt(event, tile)
}

function cargoValueOf(events: readonly DomainEventBody[]): string {
  const values = events.flatMap((event) => (event.type === 'CargoAdded' ? [event.value] : []))
  return toCanonical(values.reduce((sum, value) => add(sum, fromCanonical(value)), ZERO_MONEY))
}

const countOf = (counts: Record<string, number>) =>
  Object.values(counts).reduce((sum, count) => sum + count, 0)

const SPEEDS_M_PER_S = [18, 100]

describe('swept span per chunk against the per-cell carve (ticket 374)', () => {
  it.each(SPEEDS_M_PER_S)('cuts the same bytes across a chunk corner at %i m/s', (speed) => {
    const reference = expectSpanMatchesPerCell(chunkCornerSweep(speed))
    const widest = Math.max(...reference.map(({ events }) => chunksChangedIn(events).size))
    expect(widest).toBeGreaterThan(1)
    expect(eventsOf(reference).some(({ type }) => type === 'TileDestroyed')).toBe(true)
  })

  it.each(SPEEDS_M_PER_S)(
    'cuts the same bytes with drill gear beside the bore at %i m/s',
    (speed) => {
      const fixture = gearedCornerSweep(speed)
      const reference = expectSpanMatchesPerCell(fixture)
      const tanks = [fixture.start(), ...reference.map(({ state }) => state)].map(
        (state) => vehicleOf(state, 'p1').energy,
      )
      const charges = tanks.slice(1).map((tank, index) => tanks[index] - tank)
      expect(Math.max(...charges)).toBeGreaterThan(ENERGY_QUANTA_PER_TICK.drill)
    },
  )

  it.each(SPEEDS_M_PER_S)('cuts the same bytes past the cache up to a gate at %i m/s', (speed) => {
    const events = eventsOf(expectSpanMatchesPerCell(cacheSweep(speed)))
    expect(events.some((event) => isDestroyedAt(event, CACHE))).toBe(true)
    expect(events.some((event) => event.type === 'DrillGated')).toBe(true)
  })

  // The cache sits in a 3x3 of plain ground (#46), so a 100 m/s tick never reaches from where the
  // cache breaks to the nearest ore. At the 4-tick floor (ticket 396) the cache breaks a tick
  // sooner: 270 m/s (4.5 m a tick) is the slowest that still reaches the ore in that tick here.
  it('cuts the same bytes crossing the cache and a gate in one tick at 300 m/s', () => {
    const reference = expectSpanMatchesPerCell(cacheSweep(300))
    const isCacheAndGate = ({ events }: TickRecord) =>
      events.some((event) => isDestroyedAt(event, CACHE)) &&
      events.some((event) => event.type === 'DrillGated')
    expect(reference.some(isCacheAndGate)).toBe(true)
  })

  it('cuts the same bytes through a gate, a hazard and a full hold mid-span at 100 m/s', () => {
    const events = eventsOf(expectSpanMatchesPerCell(fullHoldSweep(100)))
    const fullAt = events.findIndex(({ type }) => type === 'StorageFull')
    expect(fullAt).toBeGreaterThan(-1)
    expect(events.slice(fullAt).some(({ type }) => type === 'TileDestroyed')).toBe(true)
    expect(events.some((event) => isGatedAt(event, RIM_GATE))).toBe(true)
    expect(events.some((event) => isGatedAt(event, STOP_GATE))).toBe(true)
    expect(events.some((event) => event.type === 'ElectrifiedCellShocked')).toBe(true)
    expect(events.some((event) => isDestroyedAt(event, ELECTRIFIED))).toBe(true)
    expect(events.some((event) => isDestroyedAt(event, STOP_GATE))).toBe(false)
  })

  it('stops only before the gated cell, never past it, at 100 m/s', () => {
    const [last] = expectSpanMatchesPerCell(fullHoldSweep(100)).slice(-1)
    const cursor = vehicleOf(last.state, 'p1').sweptCut
    expect(cursor?.yMm).toBeGreaterThanOrEqual((STOP_GATE.ty + 1) * 1000)
  })

  it('walks its centre through lava without carving it at 100 m/s, as the walk does', () => {
    const [last] = expectSpanMatchesPerCell(lavaSweep(100)).slice(-1)
    expect(cellDensitySum(last.state.world, HEAT_PARAMS, FLOOR)).toBe(
      cellDensitySum(EMPTY_WORLD, HEAT_PARAMS, FLOOR),
    )
    expect(vehicleOf(last.state, 'p1').sweptCut?.yMm).toBeGreaterThan((FLOOR.ty + 2) * 1000)
  })

  it('harvests the core cells it cuts at 18 m/s, as the walk does', () => {
    const events = eventsOf(expectSpanMatchesPerCell(coreSweep(18)))
    expect(events.some(({ type }) => type === 'CoreTileHarvested')).toBe(true)
  })

  // Ticket 335 (TD lock on #374): energy exact per cell, so a tick charges each cell it broke.
  it.each(SPEEDS_M_PER_S)('charges each cell a swept tick breaks at %i m/s', (speed) => {
    const fixture = chunkCornerSweep(speed)
    const cuts = spanCutsOf(fixture)
    const states = [fixture.start(), ...cuts.map(({ effect }) => effect.state)]
    const tanks = states.map((state) => vehicleOf(state, 'p1').energy)
    const charges = tanks.slice(1).map((tank, index) => tanks[index] - tank)
    // The strong drill breaks every cell at the tile floor, so each costs the same.
    const perCell = cellDigEnergyOf(ECONOMY.drill.minTicksPerTile * DRILL_SUBSTEPS_PER_TICK)
    expect(charges).toEqual(cuts.map(({ tally }) => tally.cells * perCell))
    expect(Math.max(...charges)).toBeGreaterThan(ENERGY_QUANTA_PER_TICK.drill)
  })
})

describe('swept span drill_cut tally (ticket 374)', () => {
  const cuts = spanCutsOf(fullHoldSweep(100))

  it('counts the cells each tick broke', () => {
    for (const { effect, tally } of cuts) {
      expect(tally.cells).toBe(effect.events.filter(({ type }) => type === 'TileDestroyed').length)
    }
  })

  it('sums the value that reached the hold', () => {
    for (const { effect, tally } of cuts) {
      expect(toCanonical(tally.value)).toBe(cargoValueOf(effect.events))
    }
  })

  it('counts the ore cells broken per ore, the units a full hold lost among them', () => {
    for (const { effect, tally } of cuts) {
      const ores = effect.events.filter(
        (event) => event.type === 'TileDestroyed' && event.kind === 'ore',
      )
      expect(countOf(tally.ores)).toBe(ores.length)
    }
    const lost = cuts.find(({ effect }) => effect.events.some(({ type }) => type === 'StorageFull'))
    const kept = lost?.effect.events.filter(({ type }) => type === 'CargoAdded').length ?? 0
    expect(countOf(lost?.tally.ores ?? {})).toBeGreaterThan(kept)
  })

  it('prices dig time in sub-steps exactly when the tick broke cells', () => {
    expect(cuts.some(({ tally }) => tally.cells > 0)).toBe(true)
    for (const { tally } of cuts) expect(tally.digSubSteps > 0).toBe(tally.cells > 0)
  })
})
