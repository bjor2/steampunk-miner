/**
 * The electrified cells of a magnetic planet (GD lock on spec #258, Q1 and Q8): ferrous cells,
 * the `metal` commons of the act's veins, that shock when drilled. Which ones is a roll per tile on
 * the mix hook's own seed, below `electrifiedShareBp`, so it comes from the planet seed alone and
 * every player sees the same cells. An electrified cell is a hazard, never a gate: nothing here is
 * asked by `canMine`, and the cell itself is not repainted, so it drills and sells as before.
 */
import { hashCell } from '../../../systems/cellRandom'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { CHUNK_SIZE, firstTileOfChunk, type TilePoint } from '../../../systems/world/tileGrid'
import {
  CELL_KIND,
  familyOfCell,
  kindOfCell,
  RESOURCE_FAMILY,
} from '../../../systems/world/worldCell'
import { mixSeedOf } from './oreMix'
import { MIX_STREAM } from './planetActs'
import { isMagneticPlanet } from './planetClass'
import { PLANET_CLASS_ROWS } from './planetClassRows'

const BASIS_POINTS = 10000

/** Whether `cell` at `tile` is an electrified ferrous cell; false off the magnetic planets. */
export function isElectrifiedCell(params: PlanetParams, tile: TilePoint, cell: number): boolean {
  return (
    isMagneticPlanet(params.planetIndex) &&
    isFerrousCell(cell) &&
    electrifiedRollOf(params, tile) < PLANET_CLASS_ROWS.magnetic.electrifiedShareBp
  )
}

/** The electrified tiles among chunk `(cx, cy)`'s cells, in row order. */
export function electrifiedTilesOfChunk(
  params: PlanetParams,
  cells: ArrayLike<number>,
  cx: number,
  cy: number,
): TilePoint[] {
  if (!isMagneticPlanet(params.planetIndex)) return []
  return chunkTilesOf(cx, cy).filter((tile, index) => isElectrifiedCell(params, tile, cells[index]))
}

/** A cell of a ferrous vein: ore of the `metal` family. */
function isFerrousCell(cell: number): boolean {
  return kindOfCell(cell) === CELL_KIND.ore && familyOfCell(cell) === RESOURCE_FAMILY.metal
}

function electrifiedRollOf(params: PlanetParams, tile: TilePoint): number {
  const stream = hashCell(mixSeedOf(params), MIX_STREAM.electrified, 0)
  return hashCell(stream, tile.tx, tile.ty) % BASIS_POINTS
}

/** The chunk's tiles in its cell order (row by row). */
function chunkTilesOf(cx: number, cy: number): TilePoint[] {
  const firstTx = firstTileOfChunk(cx)
  const firstTy = firstTileOfChunk(cy)
  return Array.from({ length: CHUNK_SIZE * CHUNK_SIZE }, (_, index) => ({
    tx: firstTx + (index % CHUNK_SIZE),
    ty: firstTy + Math.floor(index / CHUNK_SIZE),
  }))
}
