/**
 * Carving and filling the density field (decision #36 Carving and Yield), integer arithmetic only.
 * The stamps' shapes (a soft-rimmed disc, one cell's samples, a level floor) are in `stampShape`.
 *
 * - Carving for `ticks` fixed steps from tick `T0` removes, at a sample of weight `w` in a cell
 *   whose drill time is `n` ticks, `floor(255 w (T0 + ticks) / (W n)) - floor(255 w T0 / (W n))`,
 *   never below the sample's floor (0 except under a level cut). Over any `n` consecutive ticks at full weight that is exactly 255,
 *   so a cell clears in its #7 drill time whatever the stamp's path (hard rock carves slower inside
 *   the same stamp), and replaying the same ticks removes the same bytes on every machine.
 * - The swept cut (ticket 330) counts drill times in `Q` sub-steps of a tick (`subStepsPerTick`):
 *   `n` is then in sub-steps and a tick removes `255 w Q / (W n)`, the same formula with `T0` and
 *   `ticks` scaled by `Q`, so a cell may clear in a fraction of a tick and a part-dug one carries
 *   over through its densities. With `Q = 1` it is the whole-tick carve above, unchanged.
 * - A material cell yields once, at the moment the sum of its 16 samples falls to half or below
 *   (`cellYield`).
 *
 * - A lined sample (#41) carves in the drill time of its casing grade, not its cell's, and loses its
 *   casing when its density reaches 0. Its density still counts toward its cell's yield (#56).
 *   Breached lining (#111) carves at grade 0, in its cell's own drill time.
 *
 * The dock pad never carves. Every change is reported per chunk with its dirty rectangle in
 * chunk-local samples, the shape of `GroundChanged`.
 */
import {
  FULL_WEIGHT,
  cellSamplesBesideDisc,
  cellSamplesOf,
  discSamplesOf,
  type DiscStamp,
  type WeightedSample,
} from './stampShape'
import {
  clearCasingSample,
  closeSession,
  densityOf,
  editSample,
  isCarvable,
  materialOfSample,
  openSession,
  casingGradeOf,
  tileOfSample,
  type CasingCleared,
  type EditSession,
  type GroundEdit,
} from './groundEditSession'
import { effectiveCasingGrade } from './chunkDelta'
import type { PlanetParams } from './planetParams'
import { SOLID_DENSITY } from './sampleGrid'
import type { TilePoint } from './tileGrid'
import type { WorldState } from './worldState'

export type { CasingCleared, GroundChange, GroundEdit } from './groundEditSession'

/** The fixed steps a carve covers: `ticks` steps starting at authority tick `firstTick`. */
export interface CarveWindow {
  firstTick: number
  ticks: number
  /**
   * How many sub-steps of a tick the drill times are counted in: absent for whole ticks, or
   * `DRILL_SUBSTEPS_PER_TICK` for the swept cut (ticket 330).
   */
  subStepsPerTick?: number
}

/**
 * Ticks (or the window's sub-steps) a full-weight stamp needs to clear a sample of this cell's
 * material, or of casing of `casingGrade` when it is above 0 (#41), or null if the drill cannot.
 */
export type CellDrillTicks = (
  tile: TilePoint,
  material: number,
  casingGrade: number,
) => number | null

export interface Carve extends GroundEdit {
  /** The ticks in which the stamp still removed something: the drill's charged ticks. */
  ticksUsed: number
  casingCleared: CasingCleared
}

/**
 * How a carve walks a stamp's samples in its edit, answering the most ticks any of them took: in
 * rows over the stamp's bounding square (`walkStampInRows`), or the swept span's runs cut at chunk
 * borders (`sweptSpan.ts`, ticket 374), which visit the same samples in the same order.
 */
export type StampWalk = (
  session: EditSession,
  disc: DiscStamp,
  window: CarveWindow,
  drillTicksOf: CellDrillTicks,
) => number

export const walkStampInRows: StampWalk = (session, disc, window, drillTicksOf) =>
  carveEachSample(session, discSamplesOf(disc), window, drillTicksOf)

export function carveDisc(
  world: WorldState,
  params: PlanetParams,
  disc: DiscStamp,
  window: CarveWindow,
  drillTicksOf: CellDrillTicks,
  walk: StampWalk = walkStampInRows,
): Carve {
  const session = openSession(world, params)
  const ticksUsed = walk(session, disc, window, drillTicksOf)
  return { ...closeSession(session), ticksUsed, casingCleared: session.casingCleared }
}

/** A disc carve with cells beside it (slice drill gear, ticket 234). */
export interface CarveBesideDisc extends Carve {
  /** Per cell, in the order given: the ticks in which it still lost something. */
  cellTicksUsed: number[]
}

/** The ticks each carve of the cells beside a disc may use. */
export interface CarveWindows {
  disc: CarveWindow
  cells: CarveWindow
}

/**
 * The disc and, in the same edit, the cells beside it (`cellSamplesBesideDisc`), so a widened bore
 * cuts in the same ticks as the bit. `ticksUsed` stays the disc's; cells are cut only when the disc
 * removed something.
 */
export function carveDiscWithCells(
  world: WorldState,
  params: PlanetParams,
  disc: DiscStamp,
  cells: readonly TilePoint[],
  windows: CarveWindows,
  drillTicksOf: CellDrillTicks,
  walk: StampWalk = walkStampInRows,
): CarveBesideDisc {
  const session = openSession(world, params)
  const ticksUsed = walk(session, disc, windows.disc, drillTicksOf)
  const besides = cells.map((tile) => cellSamplesBesideDisc(tile, disc))
  const cellTicksUsed = carveCellsBeside(session, ticksUsed, besides, windows.cells, drillTicksOf)
  return closeWithCells(session, ticksUsed, cellTicksUsed)
}

/**
 * The scripted `drillTile` cell and, in the same edit, whole cells beside it (slice drill gear on
 * the bot's bore, ticket 392), each at its own drill time. As with the disc, `ticksUsed` stays the
 * cell's and the others are cut only when it removed something.
 */
export function carveCellWithCells(
  world: WorldState,
  params: PlanetParams,
  tile: TilePoint,
  cells: readonly TilePoint[],
  windows: CarveWindows,
  drillTicksOf: CellDrillTicks,
): CarveBesideDisc {
  const session = openSession(world, params)
  const ticksUsed = carveEachSample(session, cellSamplesOf(tile), windows.disc, drillTicksOf)
  const besides = cells.map((cell) => cellSamplesOf(cell))
  const cellTicksUsed = carveCellsBeside(session, ticksUsed, besides, windows.cells, drillTicksOf)
  return closeWithCells(session, ticksUsed, cellTicksUsed)
}

/** Each cell's samples in order, in the cells' window; none when the bit removed nothing. */
function carveCellsBeside(
  session: EditSession,
  ticksUsed: number,
  cells: readonly (readonly WeightedSample[])[],
  window: CarveWindow,
  drillTicksOf: CellDrillTicks,
): number[] {
  if (ticksUsed === 0) return cells.map(() => 0)
  return cells.map((samples) => carveEachSample(session, samples, window, drillTicksOf))
}

function closeWithCells(
  session: EditSession,
  ticksUsed: number,
  cellTicksUsed: number[],
): CarveBesideDisc {
  return {
    ...closeSession(session),
    ticksUsed,
    casingCleared: session.casingCleared,
    cellTicksUsed,
  }
}

/** One material cell's own samples at full weight: the scripted `drillTile` stamp. */
export function carveCell(
  world: WorldState,
  params: PlanetParams,
  tile: TilePoint,
  window: CarveWindow,
  drillTicksOf: CellDrillTicks,
): Carve {
  return carveSamples(world, params, cellSamplesOf(tile), window, drillTicksOf)
}

/** Raises density by up to `amount` at full weight (debug `fillCircle`; casing later, #41). */
export function fillDisc(
  world: WorldState,
  params: PlanetParams,
  disc: DiscStamp,
  amount: number,
): GroundEdit {
  const session = openSession(world, params)
  for (const sample of discSamplesOf(disc)) {
    const raise = Math.floor((amount * sample.weight) / FULL_WEIGHT)
    editSample(session, sample, (density) => Math.min(SOLID_DENSITY, density + raise))
  }
  return closeSession(session)
}

/** Lowers density by up to `amount` at full weight, regardless of hardness (debug `carveCircle`). */
export function clearDisc(
  world: WorldState,
  params: PlanetParams,
  disc: DiscStamp,
  amount: number,
): GroundEdit {
  const session = openSession(world, params)
  for (const sample of discSamplesOf(disc)) {
    if (!isCarvable(session, sample)) continue
    const cut = Math.floor((amount * sample.weight) / FULL_WEIGHT)
    const density = densityOf(session, sample)
    lowerSample(session, sample, density - Math.max(Math.min(density, sample.floor), density - cut))
  }
  return closeSession(session)
}

function carveSamples(
  world: WorldState,
  params: PlanetParams,
  samples: readonly WeightedSample[],
  window: CarveWindow,
  drillTicksOf: CellDrillTicks,
): Carve {
  const session = openSession(world, params)
  const ticksUsed = carveEachSample(session, samples, window, drillTicksOf)
  return { ...closeSession(session), ticksUsed, casingCleared: session.casingCleared }
}

/** Carves the samples in order; answers the most ticks any of them took. */
export function carveEachSample(
  session: EditSession,
  samples: readonly WeightedSample[],
  window: CarveWindow,
  drillTicksOf: CellDrillTicks,
): number {
  let ticksUsed = 0
  for (const sample of samples) {
    const ticks = carveOneSample(session, sample, window, drillTicksOf)
    ticksUsed = Math.max(ticksUsed, ticks)
  }
  return ticksUsed
}

/** Carves one sample; answers the ticks of the window it took to remove what it removed. */
function carveOneSample(
  session: EditSession,
  sample: WeightedSample,
  window: CarveWindow,
  drillTicksOf: CellDrillTicks,
): number {
  if (!isCarvable(session, sample)) return 0
  const drillTicks = drillTicksOfSample(session, sample, drillTicksOf)
  if (drillTicks === null) return 0
  const rate = {
    perTick: SOLID_DENSITY * sample.weight * (window.subStepsPerTick ?? 1),
    per: FULL_WEIGHT * drillTicks,
  }
  const density = densityOf(session, sample)
  const removal = Math.min(Math.max(0, density - sample.floor), removalOver(rate, window))
  if (removal === 0) return 0
  lowerSample(session, sample, removal)
  return ticksToRemove(rate, window.firstTick, removal)
}

/** Lowers a sample's density; a lined sample cut to density 0 loses its casing (#41). */
function lowerSample(session: EditSession, sample: WeightedSample, removal: number): void {
  editSample(session, sample, (current) => current - removal)
  if (densityOf(session, sample) === 0) clearCasingSample(session, sample)
}

/** `floor(a (T0 + k) / b) - floor(a T0 / b)`: the rate's removal over the window. */
function removalOver(rate: { perTick: number; per: number }, window: CarveWindow): number {
  const before = Math.floor((rate.perTick * window.firstTick) / rate.per)
  return Math.floor((rate.perTick * (window.firstTick + window.ticks)) / rate.per) - before
}

/** The fewest ticks from `firstTick` whose removal reaches `amount`. */
function ticksToRemove(
  rate: { perTick: number; per: number },
  firstTick: number,
  amount: number,
): number {
  const target = amount + Math.floor((rate.perTick * firstTick) / rate.per)
  return Math.ceil((target * rate.per) / rate.perTick) - firstTick
}

/** The sample's drill time: its cell's material, or its casing grade when it is lined (#41). */
function drillTicksOfSample(
  session: EditSession,
  sample: WeightedSample,
  drillTicksOf: CellDrillTicks,
): number | null {
  const tile = tileOfSample(sample)
  const grade = effectiveCasingGrade(casingGradeOf(session, sample))
  const key = `${tile.tx},${tile.ty}#${grade}`
  const known = session.drillTicks.get(key)
  if (known !== undefined) return known
  const ticks = drillTicksOf(tile, materialOfSample(session, sample), grade)
  session.drillTicks.set(key, ticks)
  return ticks
}
