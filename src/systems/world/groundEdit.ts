/**
 * Carving and filling the density field (decision #36 Carving and Yield), integer arithmetic only.
 * The stamps' shapes (a soft-rimmed disc, one cell's samples, a level floor) are in `stampShape`.
 *
 * - Carving for `ticks` fixed steps from tick `T0` removes, at a sample of weight `w` in a cell
 *   whose drill time is `n` ticks, `floor(255 w (T0 + ticks) / (W n)) - floor(255 w T0 / (W n))`,
 *   never below the sample's floor (0 except under a level cut). Over any `n` consecutive ticks at full weight that is exactly 255,
 *   so a cell clears in its #7 drill time whatever the stamp's path (hard rock carves slower inside
 *   the same stamp), and replaying the same ticks removes the same bytes on every machine.
 * - A material cell yields once, at the moment the sum of its 16 samples falls to half or below;
 *   its yield bit enforces "once".
 *
 * The dock pad never carves. Every change is reported per chunk with its dirty rectangle in
 * chunk-local samples, the shape of `GroundChanged`.
 */
import { isCellYielded, withCellsYielded, withDensity } from './chunkDelta'
import {
  FULL_WEIGHT,
  cellSamplesOf,
  discSamplesOf,
  type DiscStamp,
  type WeightedSample,
} from './stampShape'
import type { PlanetParams } from './planetParams'
import {
  CHUNK_SAMPLE_SIDE,
  SAMPLES_PER_CELL,
  SAMPLES_PER_TILE,
  SOLID_DENSITY,
  chunkOfSample,
  localSampleOf,
  sampleIndexOf,
} from './sampleGrid'
import { cellIndexOfTile, chunkKey, chunkOfTile, type TilePoint } from './tileGrid'
import { CELL_KIND, isRemovableCell, kindOfCell } from './worldCell'
import {
  currentDensityOfChunk,
  deltaOfChunk,
  generatedChunkOf,
  materialCellAt,
  rememberDensity,
  withChunkDelta,
  type WorldState,
} from './worldState'

/** The fixed steps a carve covers: `ticks` steps starting at authority tick `firstTick`. */
export interface CarveWindow {
  firstTick: number
  ticks: number
}

/** Whole ticks a full-weight stamp needs to clear a cell of this material, or null if it cannot. */
export type CellDrillTicks = (tile: TilePoint, material: number) => number | null

export interface GroundChange {
  cx: number
  cy: number
  /** Dirty rectangle in chunk-local samples, inclusive. */
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface YieldedCell {
  tile: TilePoint
  /** The material the cell was made of when it yielded. */
  cell: number
}

export interface GroundEdit {
  world: WorldState
  changes: GroundChange[]
  yielded: YieldedCell[]
}

export interface Carve extends GroundEdit {
  /** The ticks in which the stamp still removed something: the drill's charged ticks. */
  ticksUsed: number
}

const YIELD_SUM = (SAMPLES_PER_CELL * SOLID_DENSITY) >> 1

interface EditChunk {
  cx: number
  cy: number
  density: Uint8Array
  change: GroundChange
}

interface EditSession {
  world: WorldState
  params: PlanetParams
  chunks: Map<string, EditChunk>
  touchedTiles: Map<string, TilePoint>
}

export function carveDisc(
  world: WorldState,
  params: PlanetParams,
  disc: DiscStamp,
  window: CarveWindow,
  drillTicksOf: CellDrillTicks,
): Carve {
  return carveSamples(world, params, discSamplesOf(disc), window, drillTicksOf)
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
    editSample(session, sample, (density) =>
      Math.max(Math.min(density, sample.floor), density - cut),
    )
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
  let ticksUsed = 0
  for (const sample of samples) {
    const ticks = carveOneSample(session, sample, window, drillTicksOf)
    ticksUsed = Math.max(ticksUsed, ticks)
  }
  return { ...closeSession(session), ticksUsed }
}

/** Carves one sample; answers the ticks of the window it took to remove what it removed. */
function carveOneSample(
  session: EditSession,
  sample: WeightedSample,
  window: CarveWindow,
  drillTicksOf: CellDrillTicks,
): number {
  if (!isCarvable(session, sample)) return 0
  const tile = tileOfSample(sample)
  const drillTicks = drillTicksOf(tile, materialCellAt(session.world, session.params, tile))
  if (drillTicks === null) return 0
  const rate = { perTick: SOLID_DENSITY * sample.weight, per: FULL_WEIGHT * drillTicks }
  const density = densityOf(session, sample)
  const removal = Math.min(Math.max(0, density - sample.floor), removalOver(rate, window))
  if (removal === 0) return 0
  editSample(session, sample, (current) => current - removal)
  return ticksToRemove(rate, window.firstTick, removal)
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

function isCarvable(session: EditSession, sample: WeightedSample): boolean {
  if (sample.weight === 0) return false
  const material = materialCellAt(session.world, session.params, tileOfSample(sample))
  return kindOfCell(material) !== CELL_KIND.indestructible
}

function openSession(world: WorldState, params: PlanetParams): EditSession {
  return { world, params, chunks: new Map(), touchedTiles: new Map() }
}

function densityOf(session: EditSession, sample: WeightedSample): number {
  const chunk = editChunkOf(session, sample)
  return chunk.density[sampleIndexOf(localSampleOf(sample.sx), localSampleOf(sample.sy))]
}

function editSample(
  session: EditSession,
  sample: WeightedSample,
  change: (density: number) => number,
): void {
  const chunk = editChunkOf(session, sample)
  const lsx = localSampleOf(sample.sx)
  const lsy = localSampleOf(sample.sy)
  const index = sampleIndexOf(lsx, lsy)
  const next = change(chunk.density[index])
  if (next === chunk.density[index]) return
  chunk.density[index] = next
  growChange(chunk.change, lsx, lsy)
  const tile = tileOfSample(sample)
  session.touchedTiles.set(`${tile.tx},${tile.ty}`, tile)
}

/** A private copy of the chunk's density, made the first time the edit touches the chunk. */
function editChunkOf(session: EditSession, sample: WeightedSample): EditChunk {
  const cx = chunkOfSample(sample.sx)
  const cy = chunkOfSample(sample.sy)
  const key = chunkKey(cx, cy)
  const known = session.chunks.get(key)
  if (known !== undefined) return known
  const density = currentDensityOfChunk(session.world, session.params, cx, cy).slice()
  const chunk = { cx, cy, density, change: emptyChange(cx, cy) }
  session.chunks.set(key, chunk)
  return chunk
}

function emptyChange(cx: number, cy: number): GroundChange {
  return { cx, cy, x0: CHUNK_SAMPLE_SIDE, y0: CHUNK_SAMPLE_SIDE, x1: -1, y1: -1 }
}

function growChange(change: GroundChange, lsx: number, lsy: number): void {
  change.x0 = Math.min(change.x0, lsx)
  change.y0 = Math.min(change.y0, lsy)
  change.x1 = Math.max(change.x1, lsx)
  change.y1 = Math.max(change.y1, lsy)
}

/** Writes the edited densities back as deltas, then credits the cells that fell to half. */
function closeSession(session: EditSession): GroundEdit {
  const changed = [...session.chunks.values()].filter(({ change }) => change.x1 >= 0)
  const written = changed.reduce(writeChunkDensity(session.params), session.world)
  const yielded = cellsNowYielding(written, session.params, [...session.touchedTiles.values()])
  return {
    world: withYieldedCells(written, session.params, yielded),
    changes: changed.map(({ change }) => change),
    yielded,
  }
}

function writeChunkDensity(params: PlanetParams) {
  return (world: WorldState, chunk: EditChunk): WorldState => {
    const { cx, cy, density } = chunk
    const generated = generatedChunkOf(params, cx, cy).density
    const delta = withDensity(deltaOfChunk(world, cx, cy), density, generated)
    rememberDensity(delta, density)
    return withChunkDelta(world, cx, cy, delta)
  }
}

/** Touched, removable, not yet yielded cells whose 16 samples now sum to half or less. */
function cellsNowYielding(
  world: WorldState,
  params: PlanetParams,
  tiles: readonly TilePoint[],
): YieldedCell[] {
  const yielded: YieldedCell[] = []
  for (const tile of [...tiles].sort((a, b) => a.ty - b.ty || a.tx - b.tx)) {
    const cell = materialCellAt(world, params, tile)
    if (isRemovableCell(cell) && isAtYield(world, params, tile)) yielded.push({ tile, cell })
  }
  return yielded
}

function isAtYield(world: WorldState, params: PlanetParams, tile: TilePoint): boolean {
  const delta = deltaOfChunk(world, chunkOfTile(tile.tx), chunkOfTile(tile.ty))
  if (isCellYielded(delta, cellIndexOfTile(tile.tx, tile.ty))) return false
  return cellDensitySum(world, params, tile) <= YIELD_SUM
}

/** The sum of a cell's 16 density samples, the quantity the yield rule watches. */
export function cellDensitySum(world: WorldState, params: PlanetParams, tile: TilePoint): number {
  const cx = chunkOfTile(tile.tx)
  const cy = chunkOfTile(tile.ty)
  const density = currentDensityOfChunk(world, params, cx, cy)
  let sum = 0
  for (let qy = 0; qy < SAMPLES_PER_TILE; qy++) {
    for (let qx = 0; qx < SAMPLES_PER_TILE; qx++) {
      sum +=
        density[
          sampleIndexOf(
            localSampleOf(tile.tx * SAMPLES_PER_TILE + qx),
            localSampleOf(tile.ty * SAMPLES_PER_TILE + qy),
          )
        ]
    }
  }
  return sum
}

/** Yield bits change no density, so each new delta keeps the density its chunk already has. */
function withYieldedCells(
  world: WorldState,
  params: PlanetParams,
  yielded: readonly YieldedCell[],
): WorldState {
  return yielded.reduce((current, { tile }) => {
    const cx = chunkOfTile(tile.tx)
    const cy = chunkOfTile(tile.ty)
    const index = cellIndexOfTile(tile.tx, tile.ty)
    const delta = withCellsYielded(deltaOfChunk(current, cx, cy), [index])
    rememberDensity(delta, currentDensityOfChunk(current, params, cx, cy))
    return withChunkDelta(current, cx, cy, delta)
  }, world)
}

function tileOfSample(sample: WeightedSample): TilePoint {
  return {
    tx: Math.floor(sample.sx / SAMPLES_PER_TILE),
    ty: Math.floor(sample.sy / SAMPLES_PER_TILE),
  }
}
