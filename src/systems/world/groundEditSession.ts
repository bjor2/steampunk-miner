/**
 * One edit of the ground (decisions #36, #41): private copies of the chunks it touches, written back
 * as deltas when it closes, with the dirty rectangle of each changed chunk and the cells that fell
 * to their yield. The carve, fill and lining rules (`groundEdit`, `casingLining`) all edit through
 * a session, so a sample's density and casing change together and are written once.
 */
import { cellsNowYielding, withYieldedCells, type YieldedCell } from './cellYield'
import { effectiveCasingGrade, withCasing, withDensity, type ChunkDelta } from './chunkDelta'
import type { WeightedSample } from './stampShape'
import type { PlanetParams } from './planetParams'
import {
  CHUNK_SAMPLE_SIDE,
  SAMPLES_PER_TILE,
  chunkOfSample,
  localSampleOf,
  sampleIndexOf,
} from './sampleGrid'
import { chunkKey, type TilePoint } from './tileGrid'
import { CELL_KIND, kindOfCell } from './worldCell'
import {
  currentCasingOfChunk,
  currentDensityOfChunk,
  deltaOfChunk,
  generatedChunkOf,
  materialCellAt,
  rememberCasing,
  rememberDensity,
  withChunkDelta,
  type WorldState,
} from './worldState'

export interface GroundChange {
  cx: number
  cy: number
  /** Dirty rectangle in chunk-local samples, inclusive. */
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface GroundEdit {
  world: WorldState
  changes: GroundChange[]
  yielded: YieldedCell[]
}

/** Casing samples an edit drilled away (#41 `casing_drilled`), and the highest grade among them. */
export interface CasingCleared {
  samples: number
  grade: number
}

interface EditChunk {
  cx: number
  cy: number
  density: Uint8Array
  /** A private copy of the casing layer once the edit clears a casing sample, else null. */
  casing: Uint8Array | null
  change: GroundChange
}

export interface EditSession {
  world: WorldState
  params: PlanetParams
  chunks: Map<string, EditChunk>
  touchedTiles: Map<string, TilePoint>
  /** Material per tile and drill time per tile and casing grade, worked out once per edit. */
  materials: Map<string, number>
  drillTicks: Map<string, number | null>
  casingCleared: CasingCleared
}

/** The drill and the ground rules never cut the dock pad or lava (#8, #113). */
export function isCarvable(session: EditSession, sample: WeightedSample): boolean {
  if (sample.weight === 0) return false
  const kind = kindOfCell(materialOfSample(session, sample))
  return kind !== CELL_KIND.indestructible && kind !== CELL_KIND.lava
}

export function materialOfSample(session: EditSession, sample: WeightedSample): number {
  const tile = tileOfSample(sample)
  const key = `${tile.tx},${tile.ty}`
  const known = session.materials.get(key)
  if (known !== undefined) return known
  const material = materialCellAt(session.world, session.params, tile)
  session.materials.set(key, material)
  return material
}

export function openSession(world: WorldState, params: PlanetParams): EditSession {
  return {
    world,
    params,
    chunks: new Map(),
    touchedTiles: new Map(),
    materials: new Map(),
    drillTicks: new Map(),
    casingCleared: { samples: 0, grade: 0 },
  }
}

export function casingGradeOf(session: EditSession, sample: WeightedSample): number {
  const chunk = editChunkOf(session, sample)
  const casing = chunk.casing ?? currentCasingOfChunk(session.world, chunk.cx, chunk.cy)
  return casing[sampleIndexOf(localSampleOf(sample.sx), localSampleOf(sample.sy))]
}

export function clearCasingSample(session: EditSession, sample: WeightedSample): void {
  const grade = casingGradeOf(session, sample)
  if (grade === 0) return
  const chunk = editChunkOf(session, sample)
  chunk.casing ??= currentCasingOfChunk(session.world, chunk.cx, chunk.cy).slice()
  chunk.casing[sampleIndexOf(localSampleOf(sample.sx), localSampleOf(sample.sy))] = 0
  const cleared = session.casingCleared
  session.casingCleared = {
    samples: cleared.samples + 1,
    grade: Math.max(cleared.grade, effectiveCasingGrade(grade)),
  }
}

/**
 * Marks a sample as lining of `grade`, or raises its grade (#41 relining). Its density stays as it
 * is: lining is an overlay on the rock (#56), so it never moves the contour or the cell's yield.
 */
export function markSampleCasing(
  session: EditSession,
  sample: WeightedSample,
  grade: number,
): void {
  const chunk = editChunkOf(session, sample)
  const lsx = localSampleOf(sample.sx)
  const lsy = localSampleOf(sample.sy)
  chunk.casing ??= currentCasingOfChunk(session.world, chunk.cx, chunk.cy).slice()
  chunk.casing[sampleIndexOf(lsx, lsy)] = grade
  growChange(chunk.change, lsx, lsy)
}

export function densityOf(session: EditSession, sample: WeightedSample): number {
  const chunk = editChunkOf(session, sample)
  return chunk.density[sampleIndexOf(localSampleOf(sample.sx), localSampleOf(sample.sy))]
}

export function editSample(
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
  const chunk = { cx, cy, density, casing: null, change: emptyChange(cx, cy) }
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
export function closeSession(session: EditSession): GroundEdit {
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
    return withChunkDelta(world, cx, cy, withCasingOf(delta, chunk.casing))
  }
}

/** The edited casing layer joins the delta; an edit that left casing alone keeps the delta's. */
function withCasingOf(delta: ChunkDelta, casing: Uint8Array | null): ChunkDelta {
  if (casing === null) return delta
  const lined = withCasing(delta, casing)
  rememberCasing(lined, casing)
  return lined
}

export function tileOfSample(sample: WeightedSample): TilePoint {
  return {
    tx: Math.floor(sample.sx / SAMPLES_PER_TILE),
    ty: Math.floor(sample.sy / SAMPLES_PER_TILE),
  }
}
