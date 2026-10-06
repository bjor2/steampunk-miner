/**
 * Where a lining type guards the ground (spec #113): a tile whose own cell or any of its eight
 * neighbours holds intact lining of that type. The bore's wall sits within a tile of any cell on
 * its axis, so a vehicle anywhere in a refractory-lined tunnel is in its cooling corridor, and
 * lava cannot flow into a cell of it. A breached ring (#111) guards nothing.
 */
import { cellSampleIndices } from './cellYield'
import { casingTypeIndexOf } from './chunkDelta'
import { chunkOfTile, type TilePoint } from './tileGrid'
import { currentCasingOfChunk, type WorldState } from './worldState'

const NEIGHBOURHOOD = [-1, 0, 1]

export function isGuardedByLining(world: WorldState, tile: TilePoint, typeIndex: number): boolean {
  return NEIGHBOURHOOD.some((dy) =>
    NEIGHBOURHOOD.some((dx) =>
      isCellLinedWith(world, { tx: tile.tx + dx, ty: tile.ty + dy }, typeIndex),
    ),
  )
}

function isCellLinedWith(world: WorldState, tile: TilePoint, typeIndex: number): boolean {
  const casing = currentCasingOfChunk(world, chunkOfTile(tile.tx), chunkOfTile(tile.ty))
  return cellSampleIndices(tile).some((index) => casingTypeIndexOf(casing[index]) === typeIndex)
}
