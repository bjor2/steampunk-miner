/**
 * The client's "cell fully carved" hook (ticket 615, the G&V bar on #442 and the HS rule on #570):
 * the moment the drill's carve has cut the last of a yielded cell away, as opposed to the moment
 * the authority pays its unit. Since #570 the front lowers a cell over the ticks it crosses it, so
 * a cell yields (`cellYield.ts`, half its density gone) before its last sample is cut; the popup
 * chip, the pickup sound and option B's pop key to this moment instead.
 *
 * It reads only what the carve already left: each cell the drill yielded for the local player is
 * watched, its 16 samples re-summed once per answered batch, until one of these:
 * - its density is gone (a cell on the cut's line, or a whole paid cell on a travelling tick);
 * - a tick later the carve edited its chunk again and left it as it was: the front has passed it,
 *   and what stays is the bore's wall (a cell beside the line);
 * - two ticks passed with no fall: the drill stopped inside it.
 * No new pass over the world's cells. Client-only presentation: nothing here reaches the authority,
 * so yield, energy, heat, the digest and the protocol are unchanged.
 */
import type { DomainEvent } from '../authority/domainEvent'
import { chunkOfTile, type TilePoint } from '../world/tileGrid'

/** A cell the carve finished, with the events its yield raised: its `TileDestroyed`, its unit. */
export interface CarvedCell {
  tile: TilePoint
  /** The tick the hook saw the cell finished. */
  tick: number
  yieldEvents: readonly DomainEvent[]
}

interface CarvingCell {
  tile: TilePoint
  yieldEvents: readonly DomainEvent[]
  /** The cell's density sum when last read. */
  sum: number
  /** The last tick its sum fell (its yield's tick at first). */
  fellAtTick: number
}

export interface CarveWatch {
  planetIndex: number | null
  /** Yield order: the walk's. */
  carving: readonly CarvingCell[]
}

export const EMPTY_CARVE_WATCH: CarveWatch = { planetIndex: null, carving: [] }

/** One batch the authority answered, and how the carve left a cell's 16 samples after it. */
export interface CarveBatch {
  events: readonly DomainEvent[]
  tick: number
  planetIndex: number
  playerId: string
  densitySumOf: (tile: TilePoint) => number
}

export interface CarveTurn {
  watch: CarveWatch
  /** The cells finished in this batch, in walk order: the earlier yields first. */
  carved: CarvedCell[]
}

/** A drill-stopped cell is finished once this many ticks passed since its sum last fell. */
const STILL_TICKS = 2

export function followCarves(watch: CarveWatch, batch: CarveBatch): CarveTurn {
  const watched = carvingOnPlanet(watch, batch.planetIndex)
  const judged = [...watched.map((cell) => judgedCell(cell, batch)), ...freshCellsOf(batch)]
  return turnOf(batch, judged)
}

/** The batch with the local player's drill-paid units left out: they show when their cell is carved. */
export function withoutCarvingPickups(
  events: readonly DomainEvent[],
  playerId: string,
): DomainEvent[] {
  return events.filter((_, at) => !isPairedPickupAt(events, at, playerId))
}

function isPairedPickupAt(events: readonly DomainEvent[], at: number, playerId: string): boolean {
  return events[at].type === 'CargoAdded' && isDrillYieldAt(events, at - 1, playerId)
}

/** Every yield event of the finished cells, in order, as one batch. */
export function yieldEventsOf(carved: readonly CarvedCell[]): DomainEvent[] {
  return carved.flatMap((cell) => cell.yieldEvents)
}

/** A new planet drops the cells of the last one. */
function carvingOnPlanet(watch: CarveWatch, planetIndex: number): readonly CarvingCell[] {
  return watch.planetIndex === planetIndex ? watch.carving : []
}

type Judged = { cell: CarvingCell; isCarved: boolean }

function judgedCell(cell: CarvingCell, batch: CarveBatch): Judged {
  const sum = batch.densitySumOf(cell.tile)
  if (sum === 0) return { cell, isCarved: true }
  if (sum < cell.sum) return { cell: { ...cell, sum, fellAtTick: batch.tick }, isCarved: false }
  return { cell, isCarved: isPastCarving(cell, batch) }
}

/** The carve moved past the cell, or stopped inside it. */
function isPastCarving(cell: CarvingCell, batch: CarveBatch): boolean {
  if (batch.tick <= cell.fellAtTick) return false
  return batch.tick >= cell.fellAtTick + STILL_TICKS || isChunkEdited(batch.events, cell.tile)
}

function isChunkEdited(events: readonly DomainEvent[], { tx, ty }: TilePoint): boolean {
  const cx = chunkOfTile(tx)
  const cy = chunkOfTile(ty)
  return events.some(
    (event) => event.type === 'GroundChanged' && event.cx === cx && event.cy === cy,
  )
}

/** The cells the drill yielded for the local player in this batch, each read as the carve left it. */
function freshCellsOf(batch: CarveBatch): Judged[] {
  return batch.events.flatMap((event, at) => {
    if (event.type !== 'TileDestroyed' || !isDrillYieldAt(batch.events, at, batch.playerId)) {
      return []
    }
    const tile = { tx: event.tx, ty: event.ty }
    const sum = batch.densitySumOf(tile)
    const yieldEvents = [event, ...pairedPickupOf(batch.events, at)]
    return [{ cell: { tile, yieldEvents, sum, fellAtTick: batch.tick }, isCarved: sum === 0 }]
  })
}

/**
 * The drill's broken cell: a `TileDestroyed` with no cause (a blast's and a bore's name theirs),
 * raised for the player just before its unit (`groundDrill.ts`, as `findRarity.ts` pairs it).
 */
function isDrillYieldAt(events: readonly DomainEvent[], at: number, playerId: string): boolean {
  const event = events[at]
  if (event?.type !== 'TileDestroyed' || event.cause !== undefined) return false
  return event.playerId === playerId
}

function pairedPickupOf(events: readonly DomainEvent[], at: number): DomainEvent[] {
  const next = events[at + 1]
  return next?.type === 'CargoAdded' ? [next] : []
}

function turnOf(batch: CarveBatch, judged: readonly Judged[]): CarveTurn {
  const carving = judged.filter((entry) => !entry.isCarved).map((entry) => entry.cell)
  const carved = judged.filter((entry) => entry.isCarved).map((entry) => carvedOf(entry, batch))
  return { watch: { planetIndex: batch.planetIndex, carving }, carved }
}

function carvedOf({ cell }: Judged, batch: CarveBatch): CarvedCell {
  return { tile: cell.tile, tick: batch.tick, yieldEvents: cell.yieldEvents }
}
