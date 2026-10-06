/**
 * The world part of authority state (decisions #3, #4, #36): the planet is its seed and params
 * plus the deltas of touched chunks. Material cells, density, yield bits and overrides are all
 * integers in plain JSON shapes (deltas as in `chunkDelta.ts`), so the canonical JSON and the
 * state digest cover them. Drill progress is the density itself, saved like everything else.
 * Immutable: every change returns a new world.
 */
import { createChunkCache, type ChunkCache } from './chunkCache'
import {
  applyChunkDelta,
  decodeCasing,
  decodeDensity,
  EMPTY_CHUNK_DELTA,
  isCellYielded,
  materialCellOf,
  materialCellsOf,
  NO_CASING,
  type ChunkDelta,
} from './chunkDelta'
import type { GeneratedChunk } from './generateChunk'
import type { PlanetParams } from './planetParams'
import { cellIndexOfTile, chunkKey, chunkOfTile, type TilePoint } from './tileGrid'
import { AIR_CELL, isLavaCell } from './worldCell'

export interface WorldState {
  /** Deltas of touched chunks only, keyed by `chunkKey(cx, cy)`. */
  chunks: Readonly<Record<string, ChunkDelta>>
}

export const EMPTY_WORLD: WorldState = { chunks: {} }

/** Generated chunks held for the authority's lookups; touched chunks stay (see chunkCache). */
const CACHED_CHUNKS = 64

let cacheOfPlanet: { params: PlanetParams; cache: ChunkCache } | null = null

/**
 * Decoded densities, kept per delta object: a delta never changes, so its density never does, and
 * a carve hands the array it built straight in (`rememberDensity`) instead of decoding it again.
 */
const densityOfDelta = new WeakMap<ChunkDelta, Uint8Array>()
/** Decoded casing layers, kept per delta object like the densities (#41). */
const casingOfDelta = new WeakMap<ChunkDelta, Uint8Array>()

export function deltaOfChunk(world: WorldState, cx: number, cy: number): ChunkDelta {
  return world.chunks[chunkKey(cx, cy)] ?? EMPTY_CHUNK_DELTA
}

export function withChunkDelta(
  world: WorldState,
  cx: number,
  cy: number,
  delta: ChunkDelta,
): WorldState {
  return { chunks: { ...world.chunks, [chunkKey(cx, cy)]: delta } }
}

/** The packed cell at a tile as the world stands now: a yielded cell is open ground, lava is lava. */
export function cellAt(world: WorldState, params: PlanetParams, tile: TilePoint): number {
  const delta = deltaOfChunk(world, chunkOfTile(tile.tx), chunkOfTile(tile.ty))
  const material = materialCellAt(world, params, tile)
  if (isLavaCell(material)) return material
  return isCellYielded(delta, cellIndexOfTile(tile.tx, tile.ty)) ? AIR_CELL : material
}

/** What a tile is made of, yielded or not: generated, then any override (#36), then lava (#113). */
export function materialCellAt(world: WorldState, params: PlanetParams, tile: TilePoint): number {
  const cx = chunkOfTile(tile.tx)
  const cy = chunkOfTile(tile.ty)
  const index = cellIndexOfTile(tile.tx, tile.ty)
  const generated = cacheOf(params).generatedCellsOf(cx, cy)[index]
  return materialCellOf(generated, deltaOfChunk(world, cx, cy), index)
}

export function isTileYielded(world: WorldState, tile: TilePoint): boolean {
  const delta = deltaOfChunk(world, chunkOfTile(tile.tx), chunkOfTile(tile.ty))
  return isCellYielded(delta, cellIndexOfTile(tile.tx, tile.ty))
}

/**
 * All cells of a chunk as the world stands now (yielded cells open). An untouched chunk answers
 * the cache's own array, which callers must only read.
 */
export function currentCellsOfChunk(
  world: WorldState,
  params: PlanetParams,
  cx: number,
  cy: number,
): Uint32Array {
  const delta = world.chunks[chunkKey(cx, cy)]
  const cells = cacheOf(params).generatedCellsOf(cx, cy)
  return delta === undefined ? cells : applyChunkDelta(cells, delta)
}

/** All material cells of a chunk, yielded or not, for drawing what the ground is made of. */
export function materialCellsOfChunk(
  world: WorldState,
  params: PlanetParams,
  cx: number,
  cy: number,
): Uint32Array {
  const delta = world.chunks[chunkKey(cx, cy)]
  const cells = cacheOf(params).generatedCellsOf(cx, cy)
  return delta === undefined ? cells : materialCellsOf(cells, delta)
}

/** The chunk's density as it stands now; callers must only read it. */
export function currentDensityOfChunk(
  world: WorldState,
  params: PlanetParams,
  cx: number,
  cy: number,
): Uint8Array {
  const delta = world.chunks[chunkKey(cx, cy)]
  const { density } = generatedChunkOf(params, cx, cy)
  if (delta === undefined) return density
  return decodedDensityOf(density, delta)
}

/**
 * The density a delta of chunk `(cx, cy)` stands for, the world's now or an earlier one, read from
 * the same per-delta store; a delta that changed no density answers the generated array. Callers
 * must only read it.
 */
export function densityOfChunkDelta(
  params: PlanetParams,
  cx: number,
  cy: number,
  delta: ChunkDelta,
): Uint8Array {
  const { density } = generatedChunkOf(params, cx, cy)
  return delta.density.length === 0 ? density : decodedDensityOf(density, delta)
}

function decodedDensityOf(generated: Uint8Array, delta: ChunkDelta): Uint8Array {
  const known = densityOfDelta.get(delta)
  if (known !== undefined) return known
  const decoded = decodeDensity(generated, delta)
  densityOfDelta.set(delta, decoded)
  return decoded
}

/** The chunk's casing layer (#41), one grade per sample, 0 for none; callers must only read it. */
export function currentCasingOfChunk(world: WorldState, cx: number, cy: number): Uint8Array {
  return casingOfChunkDelta(deltaOfChunk(world, cx, cy))
}

/** The casing layer a chunk delta stands for, the world's now or an earlier one; read only. */
export function casingOfChunkDelta(delta: ChunkDelta): Uint8Array {
  if (delta.casing.length === 0) return NO_CASING
  const known = casingOfDelta.get(delta)
  if (known !== undefined) return known
  const decoded = decodeCasing(delta)
  casingOfDelta.set(delta, decoded)
  return decoded
}

/** Hands a delta the casing array it was encoded from; the caller gives up writing to it. */
export function rememberCasing(delta: ChunkDelta, casing: Uint8Array): void {
  casingOfDelta.set(delta, casing)
}

/** Hands a delta the density array it was encoded from; the caller gives up writing to it. */
export function rememberDensity(delta: ChunkDelta, density: Uint8Array): void {
  densityOfDelta.set(delta, density)
}

/** The generated cells and density of a chunk, from the planet's cache. */
export function generatedChunkOf(params: PlanetParams, cx: number, cy: number): GeneratedChunk {
  return cacheOf(params).generatedChunkOf(cx, cy)
}

/** Generation is pure, so one cache per planet only saves time; it never changes an answer. */
function cacheOf(params: PlanetParams): ChunkCache {
  if (cacheOfPlanet === null || !isSamePlanet(cacheOfPlanet.params, params)) {
    cacheOfPlanet = { params, cache: createChunkCache(params, CACHED_CHUNKS) }
  }
  return cacheOfPlanet.cache
}

function isSamePlanet(a: PlanetParams, b: PlanetParams): boolean {
  return a.worldSeed === b.worldSeed && a.planetIndex === b.planetIndex
}
