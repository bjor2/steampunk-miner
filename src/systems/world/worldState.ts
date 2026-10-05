/**
 * The world part of authority state (decisions #3 and #4): the planet is its seed and params plus
 * the deltas of touched chunks, and tile damage is authority state, not Rapier state. Plain JSON
 * shapes (deltas as in `chunkDelta.ts`, drill work as BigStat), so the canonical JSON and the
 * state digest cover them. Immutable: every change returns a new world.
 */
import { ZERO_MONEY, type BigStat } from '../money'
import { createChunkCache, type ChunkCache } from './chunkCache'
import {
  applyChunkDelta,
  EMPTY_CHUNK_DELTA,
  isCellRemoved,
  withCellRemoved,
  type ChunkDelta,
} from './chunkDelta'
import type { PlanetParams } from './planetParams'
import { cellIndexOfTile, chunkKey, chunkOfTile, type TilePoint } from './tileGrid'
import { AIR_CELL } from './worldCell'

export interface WorldState {
  /** Deltas of touched chunks only, keyed by `chunkKey(cx, cy)`. */
  chunks: Readonly<Record<string, ChunkDelta>>
  /** Drill work on partly drilled tiles, keyed by `tileKey`; a broken tile drops its entry. */
  tileWork: Readonly<Record<string, BigStat>>
}

export const EMPTY_WORLD: WorldState = { chunks: {}, tileWork: {} }

/** Generated chunks held for the authority's lookups; touched chunks stay (see chunkCache). */
const CACHED_CHUNKS = 64

let cacheOfPlanet: { params: PlanetParams; cache: ChunkCache } | null = null

export function tileKey(tile: TilePoint): string {
  return `${tile.tx},${tile.ty}`
}

/** The packed cell at a tile as the world stands now: generated, then the chunk's delta. */
export function cellAt(world: WorldState, params: PlanetParams, tile: TilePoint): number {
  const cx = chunkOfTile(tile.tx)
  const cy = chunkOfTile(tile.ty)
  const delta = world.chunks[chunkKey(cx, cy)] ?? EMPTY_CHUNK_DELTA
  const index = cellIndexOfTile(tile.tx, tile.ty)
  if (isCellRemoved(delta, index)) return AIR_CELL
  const override = delta.overrides.find(([at]) => at === index)
  return override === undefined ? generatedCellsOf(params, cx, cy)[index] : override[1]
}

/**
 * All cells of a chunk as the world stands now, for the renderer. An untouched chunk answers the
 * cache's own array, which callers must only read.
 */
export function currentCellsOfChunk(
  world: WorldState,
  params: PlanetParams,
  cx: number,
  cy: number,
): Uint32Array {
  const delta = world.chunks[chunkKey(cx, cy)]
  const generated = generatedCellsOf(params, cx, cy)
  return delta === undefined ? generated : applyChunkDelta(generated, delta)
}

/** A broken tile becomes air for good (#10: removed tiles never regrow in the slice). */
export function withTileRemoved(world: WorldState, tile: TilePoint): WorldState {
  const key = chunkKey(chunkOfTile(tile.tx), chunkOfTile(tile.ty))
  const delta = world.chunks[key] ?? EMPTY_CHUNK_DELTA
  const { [tileKey(tile)]: _broken, ...tileWork } = world.tileWork
  return {
    chunks: { ...world.chunks, [key]: withCellRemoved(delta, cellIndexOfTile(tile.tx, tile.ty)) },
    tileWork,
  }
}

export function tileWorkAt(world: WorldState, tile: TilePoint): BigStat {
  return world.tileWork[tileKey(tile)] ?? ZERO_MONEY
}

export function withTileWork(world: WorldState, tile: TilePoint, work: BigStat): WorldState {
  return { ...world, tileWork: { ...world.tileWork, [tileKey(tile)]: work } }
}

/** Generation is pure, so one cache per planet only saves time; it never changes an answer. */
function generatedCellsOf(params: PlanetParams, cx: number, cy: number): Uint32Array {
  if (cacheOfPlanet === null || !isSamePlanet(cacheOfPlanet.params, params)) {
    cacheOfPlanet = { params, cache: createChunkCache(params, CACHED_CHUNKS) }
  }
  return cacheOfPlanet.cache.generatedCellsOf(cx, cy)
}

function isSamePlanet(a: PlanetParams, b: PlanetParams): boolean {
  return a.worldSeed === b.worldSeed && a.planetIndex === b.planetIndex
}
