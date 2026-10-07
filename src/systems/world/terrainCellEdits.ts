/**
 * The two kinds of cell edit a power-up queues on the terrain (#162 section 3, K6 #189), applied by
 * the authority's shared per-tick queue:
 *
 * - a density edit sets every unlined sample of a tile to one density (0 opens it, solid packs it),
 *   so a pocket lance can open a cavity and pack its spoil into the walls; lining holds and the dock
 *   pad and lava never change, as for every ground edit;
 * - a swap replaces a tile's material cell, as the ore-shifter and the lodestone move ore.
 *
 * Both report their chunk changes in the shape of `GroundChanged`. Neither credits ore: a slice
 * queues only cells it may change.
 */
import { withCellOverride } from './chunkDelta'
import { cellSamplesOf } from './stampShape'
import {
  casingGradeOf,
  closeSession,
  editSample,
  isCarvable,
  openSession,
  type EditSession,
  type GroundChange,
  type GroundEdit,
} from './groundEditSession'
import type { PlanetParams } from './planetParams'
import { SAMPLES_PER_TILE } from './sampleGrid'
import { cellIndexOfTile, chunkOfTile, CHUNK_SIZE, type TilePoint } from './tileGrid'
import { deltaOfChunk, withChunkDelta, type WorldState } from './worldState'

export interface TileDensity extends TilePoint {
  density: number
}

export interface TileSwap extends TilePoint {
  cell: number
}

export function setTileDensities(
  world: WorldState,
  params: PlanetParams,
  tiles: readonly TileDensity[],
): GroundEdit {
  const session = openSession(world, params)
  for (const tile of tiles) setTileDensity(session, tile)
  return closeSession(session)
}

/** Each tile's material becomes its `cell`; one change per tile, its samples' rectangle. */
export function swapTileCells(
  world: WorldState,
  tiles: readonly TileSwap[],
): { world: WorldState; changes: GroundChange[] } {
  const swapped = tiles.reduce(withSwappedCell, world)
  return { world: swapped, changes: tiles.map(changeOfTile) }
}

function setTileDensity(session: EditSession, tile: TileDensity): void {
  for (const sample of cellSamplesOf(tile)) {
    if (!isCarvable(session, sample) || casingGradeOf(session, sample) !== 0) continue
    editSample(session, sample, () => tile.density)
  }
}

function withSwappedCell(world: WorldState, tile: TileSwap): WorldState {
  const cx = chunkOfTile(tile.tx)
  const cy = chunkOfTile(tile.ty)
  const index = cellIndexOfTile(tile.tx, tile.ty)
  return withChunkDelta(
    world,
    cx,
    cy,
    withCellOverride(deltaOfChunk(world, cx, cy), index, tile.cell),
  )
}

function changeOfTile(tile: TilePoint): GroundChange {
  const cx = chunkOfTile(tile.tx)
  const cy = chunkOfTile(tile.ty)
  const x0 = (tile.tx - cx * CHUNK_SIZE) * SAMPLES_PER_TILE
  const y0 = (tile.ty - cy * CHUNK_SIZE) * SAMPLES_PER_TILE
  return { cx, cy, x0, y0, x1: x0 + SAMPLES_PER_TILE - 1, y1: y0 + SAMPLES_PER_TILE - 1 }
}
