/**
 * Ground render blocks (#38 visible-block budget): the camera rotates, so the ground is culled by
 * the view circle in 8 m blocks rather than whole 32 m chunks. A chunk stays one draw call; it
 * draws only the tiles of its blocks in view, copied into its drawn instance arrays whenever the
 * shown set changes. Resolution never enters: the circle is in metres, so 1080p and 4K draw the
 * same blocks.
 */
import { GROUND_BLOCK_SIZE } from '../../constants/scene'
import type { Vector2 } from '../vehicle/localFrame'
import { CHUNK_SIZE } from '../world/tileGrid'
import { visibleSquaresAround, type GridSquare } from './visibleChunks'

export const BLOCKS_PER_CHUNK_SIDE = CHUNK_SIZE / GROUND_BLOCK_SIZE
export const BLOCKS_PER_CHUNK = BLOCKS_PER_CHUNK_SIDE * BLOCKS_PER_CHUNK_SIDE

/** Instance attributes for `count` tiles, as the terrain shader reads them. */
export interface TileInstances {
  count: number
  /** 2 per tile: the tile's x and y inside the chunk. */
  tiles: Float32Array
  /** 3 per tile: the ground or core colour, already shaded. */
  baseColours: Float32Array
  /** 4 per tile: ore colour and glow (zeros without ore). */
  oreColours: Float32Array
  /** 4 per tile: style, unused, silhouette code, sparkle count. */
  styles: Float32Array
}

/** A chunk's tiles laid out block by block: block `b` is `blockStarts[b]` to `blockStarts[b + 1]`. */
export interface BlockedTileInstances extends TileInstances {
  blockStarts: Int32Array
}

/** A chunk with blocks in view; bit `b` of `blockMask` is block `b` (row-major from bottom-left). */
export interface ShownChunk {
  cx: number
  cy: number
  blockMask: number
}

/** Every 8 m block in view that holds a tile of the planet, nearest first. */
export function visibleGroundBlocksAround(
  centre: Vector2,
  viewRadius: number,
  planetRadiusTiles: number,
): GridSquare[] {
  return visibleSquaresAround(centre, viewRadius, planetRadiusTiles, GROUND_BLOCK_SIZE)
}

/** The chunks the blocks fall in, nearest chunk first, each with the mask of its shown blocks. */
export function shownChunksOf(blocks: readonly GridSquare[]): ShownChunk[] {
  const byKey = new Map<string, ShownChunk>()
  for (const block of blocks) {
    const cx = Math.floor(block.column / BLOCKS_PER_CHUNK_SIDE)
    const cy = Math.floor(block.row / BLOCKS_PER_CHUNK_SIDE)
    const shown = byKey.get(`${cx},${cy}`) ?? { cx, cy, blockMask: 0 }
    shown.blockMask |= 1 << blockIndexInChunk(block)
    byKey.set(`${cx},${cy}`, shown)
  }
  return [...byKey.values()]
}

function blockIndexInChunk(block: GridSquare): number {
  const column =
    block.column - Math.floor(block.column / BLOCKS_PER_CHUNK_SIDE) * BLOCKS_PER_CHUNK_SIDE
  const row = block.row - Math.floor(block.row / BLOCKS_PER_CHUNK_SIDE) * BLOCKS_PER_CHUNK_SIDE
  return row * BLOCKS_PER_CHUNK_SIDE + column
}

/** Blocks in the mask that hold at least one tile: the ones that actually draw. */
export function drawnBlockCountOf(batch: BlockedTileInstances, blockMask: number): number {
  let drawn = 0
  for (let block = 0; block < BLOCKS_PER_CHUNK; block++) {
    if (isShownWithTiles(batch, blockMask, block)) drawn++
  }
  return drawn
}

/** Copies the tiles of the shown blocks into `drawn`, in block order, and sets its count. */
export function copyShownBlocks(
  batch: BlockedTileInstances,
  blockMask: number,
  drawn: TileInstances,
): void {
  drawn.count = 0
  for (let block = 0; block < BLOCKS_PER_CHUNK; block++) {
    if (isShownWithTiles(batch, blockMask, block)) copyBlock(batch, block, drawn)
  }
}

function isShownWithTiles(batch: BlockedTileInstances, blockMask: number, block: number): boolean {
  const isShown = (blockMask & (1 << block)) !== 0
  return isShown && batch.blockStarts[block + 1] > batch.blockStarts[block]
}

function copyBlock(batch: BlockedTileInstances, block: number, drawn: TileInstances): void {
  const start = batch.blockStarts[block]
  const end = batch.blockStarts[block + 1]
  drawn.tiles.set(batch.tiles.subarray(start * 2, end * 2), drawn.count * 2)
  drawn.baseColours.set(batch.baseColours.subarray(start * 3, end * 3), drawn.count * 3)
  drawn.oreColours.set(batch.oreColours.subarray(start * 4, end * 4), drawn.count * 4)
  drawn.styles.set(batch.styles.subarray(start * 4, end * 4), drawn.count * 4)
  drawn.count += end - start
}
