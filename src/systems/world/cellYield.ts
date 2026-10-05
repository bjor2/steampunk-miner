/**
 * The yield rule of decision #36: a material cell credits its ore once, at the moment the sum of
 * its 16 density samples falls to half of full or below; its yield bit enforces "once".
 * Lining (#41) is a mark on solid rock that leaves its density alone (#56 yield ruling), so a lined
 * sample counts toward the sum like any other: lined and unlined walls pay the same ore.
 */
import { isCellYielded, withCellsYielded } from './chunkDelta'
import type { PlanetParams } from './planetParams'
import {
  SAMPLES_PER_CELL,
  SAMPLES_PER_TILE,
  SOLID_DENSITY,
  localSampleOf,
  sampleIndexOf,
} from './sampleGrid'
import { cellIndexOfTile, chunkOfTile, type TilePoint } from './tileGrid'
import { isRemovableCell } from './worldCell'
import {
  currentDensityOfChunk,
  deltaOfChunk,
  materialCellAt,
  rememberDensity,
  withChunkDelta,
  type WorldState,
} from './worldState'

export interface YieldedCell {
  tile: TilePoint
  /** The material the cell was made of when it yielded. */
  cell: number
}

const YIELD_SUM = (SAMPLES_PER_CELL * SOLID_DENSITY) >> 1

/** Touched, removable, not yet yielded cells whose 16 samples now sum to half or less. */
export function cellsNowYielding(
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

/** Yield bits change no density, so each new delta keeps the density its chunk already has. */
export function withYieldedCells(
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

/** The sum of a cell's 16 density samples, lining included. */
export function cellDensitySum(world: WorldState, params: PlanetParams, tile: TilePoint): number {
  const density = currentDensityOfChunk(world, params, chunkOfTile(tile.tx), chunkOfTile(tile.ty))
  return cellSampleIndices(tile).reduce((sum, index) => sum + density[index], 0)
}

/** Chunk-local indices of a cell's 16 samples. */
export function cellSampleIndices(tile: TilePoint): number[] {
  const indices: number[] = []
  for (let qy = 0; qy < SAMPLES_PER_TILE; qy++) {
    for (let qx = 0; qx < SAMPLES_PER_TILE; qx++) {
      indices.push(
        sampleIndexOf(
          localSampleOf(tile.tx * SAMPLES_PER_TILE + qx),
          localSampleOf(tile.ty * SAMPLES_PER_TILE + qy),
        ),
      )
    }
  }
  return indices
}
