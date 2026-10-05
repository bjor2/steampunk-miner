/**
 * One chunk's tiles as instance data for a single batched draw (#4 Rendering, #13, #36): every
 * tile the ground's surface can cross becomes one instance with its local position, its shaded
 * band colour and its ore look. The shader cuts each quad along the density contour at 128 (the
 * chunk's density halo, `densityHalo.ts`) and draws the edge highlight along it, so the ground
 * reads as the smooth surface the vehicle collides with. Colours come from the material, drilled
 * or not; a tile of space or cave air the surface ramps into takes its band's ground colour.
 * Tiles stay aligned to the world, never to the screen, so the look holds at any camera rotation.
 */
import { GROUND_BLOCK_SIZE } from '../../constants/scene'
import type { PlanetParams } from '../world/planetParams'
import { bandOfTile } from '../world/planetGeometry'
import { ISO_DENSITY, SAMPLES_PER_TILE } from '../world/sampleGrid'
import { CHUNK_CELLS, CHUNK_SIZE, firstTileOfChunk } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { DENSITY_HALO_SIDE } from './densityHalo'
import { BLOCKS_PER_CHUNK, BLOCKS_PER_CHUNK_SIDE, type BlockedTileInstances } from './groundBlocks'
import type { BandPalette } from './artDirection'
import { bandColourOf, paletteOf, tileShadeOf } from './bandPalette'
import type { Rgb } from './colour'
import { oreLookOfCell, type OreLook } from './oreLook'

/** How the shader draws a tile. */
export const TILE_STYLE = { ground: 0, ore: 1, core: 2, pad: 3 } as const

/** The ore decal's shape code in the shader: 0 for a tile without ore. */
export const SILHOUETTE_CODE = { none: 0, flecks: 1, shards: 2 } as const

/**
 * A chunk's instance attributes, `count` tiles long; arrays are sized for a full chunk. Tiles come
 * block by block (#38 ground blocks), so the renderer can draw only the blocks in view.
 */
export type ChunkTileBatch = BlockedTileInstances

interface BatchContext {
  params: PlanetParams
  palette: BandPalette
  /** Bands 1 to 5, mixed once per chunk. */
  bandColours: readonly Rgb[]
  cells: Uint32Array
  firstTx: number
  firstTy: number
  oreLooks: Map<number, OreLook>
}

const NO_ORE: Rgb = [0, 0, 0]
const BANDS = [1, 2, 3, 4, 5]

/** `cells` are the chunk's material cells; `halo` its density halo. */
export function buildChunkTileBatch(
  params: PlanetParams,
  cx: number,
  cy: number,
  cells: Uint32Array,
  halo: Uint8Array,
): ChunkTileBatch {
  const context = batchContextOf(params, cx, cy, cells)
  const batch = emptyBatch()
  for (let block = 0; block < BLOCKS_PER_CHUNK; block++) {
    batch.blockStarts[block] = batch.count
    writeBlock(batch, context, halo, block)
  }
  batch.blockStarts[BLOCKS_PER_CHUNK] = batch.count
  return batch
}

function writeBlock(
  batch: ChunkTileBatch,
  context: BatchContext,
  halo: Uint8Array,
  block: number,
): void {
  const firstLx = (block % BLOCKS_PER_CHUNK_SIDE) * GROUND_BLOCK_SIZE
  const firstLy = Math.floor(block / BLOCKS_PER_CHUNK_SIDE) * GROUND_BLOCK_SIZE
  for (let ly = firstLy; ly < firstLy + GROUND_BLOCK_SIZE; ly++) {
    for (let lx = firstLx; lx < firstLx + GROUND_BLOCK_SIZE; lx++) {
      if (hasGroundIn(halo, lx, ly)) writeTile(batch, context, lx, ly)
    }
  }
}

/** Whether any of the 5 x 5 samples bounding the tile's square is solid, so the surface shows. */
function hasGroundIn(halo: Uint8Array, lx: number, ly: number): boolean {
  for (let qy = 0; qy <= SAMPLES_PER_TILE; qy++) {
    const row = (ly * SAMPLES_PER_TILE + qy) * DENSITY_HALO_SIDE + lx * SAMPLES_PER_TILE
    for (let qx = 0; qx <= SAMPLES_PER_TILE; qx++) {
      if (halo[row + qx] >= ISO_DENSITY) return true
    }
  }
  return false
}

function batchContextOf(
  params: PlanetParams,
  cx: number,
  cy: number,
  cells: Uint32Array,
): BatchContext {
  const palette = paletteOf(params.paletteId)
  return {
    params,
    palette,
    bandColours: BANDS.map((band) => bandColourOf(palette, band)),
    cells,
    firstTx: firstTileOfChunk(cx),
    firstTy: firstTileOfChunk(cy),
    oreLooks: new Map(),
  }
}

function emptyBatch(): ChunkTileBatch {
  return {
    count: 0,
    blockStarts: new Int32Array(BLOCKS_PER_CHUNK + 1),
    tiles: new Float32Array(CHUNK_CELLS * 2),
    baseColours: new Float32Array(CHUNK_CELLS * 3),
    oreColours: new Float32Array(CHUNK_CELLS * 4),
    styles: new Float32Array(CHUNK_CELLS * 4),
  }
}

function writeTile(batch: ChunkTileBatch, context: BatchContext, lx: number, ly: number): void {
  const cell = context.cells[ly * CHUNK_SIZE + lx]
  const ore = kindOfCell(cell) === CELL_KIND.ore ? oreLookOf(context, cell) : null
  const at = batch.count
  writeVector(batch.tiles, at * 2, lx, ly)
  writeShadedRgb(
    batch.baseColours,
    at * 3,
    baseColourOf(context, cell, lx, ly),
    shadeOf(context, cell, lx, ly),
  )
  writeRgb(batch.oreColours, at * 4, ore?.colour ?? NO_ORE)
  batch.oreColours[at * 4 + 3] = ore?.glow ?? 0
  writeVector(batch.styles, at * 4, styleOf(cell), 0)
  writeVector(
    batch.styles,
    at * 4 + 2,
    SILHOUETTE_CODE[ore?.silhouette ?? 'none'],
    ore?.sparkles ?? 0,
  )
  batch.count = at + 1
}

// Index writes, not `set([...])`: a chunk has up to 1024 tiles and is rebuilt inside a frame.
function writeVector(target: Float32Array, at: number, first: number, second: number): void {
  target[at] = first
  target[at + 1] = second
}

function writeShadedRgb(target: Float32Array, at: number, colour: Rgb, shade: number): void {
  target[at] = Math.min(1, colour[0] * shade)
  target[at + 1] = Math.min(1, colour[1] * shade)
  target[at + 2] = Math.min(1, colour[2] * shade)
}

function writeRgb(target: Float32Array, at: number, colour: Rgb): void {
  target[at] = colour[0]
  target[at + 1] = colour[1]
  target[at + 2] = colour[2]
}

function oreLookOf(context: BatchContext, cell: number): OreLook {
  const known = context.oreLooks.get(cell)
  if (known !== undefined) return known
  const look = oreLookOfCell(context.params, cell)
  context.oreLooks.set(cell, look)
  return look
}

function baseColourOf(context: BatchContext, cell: number, lx: number, ly: number): Rgb {
  const kind = kindOfCell(cell)
  if (kind === CELL_KIND.indestructible) return context.palette.pad
  if (kind === CELL_KIND.core) return context.palette.core
  return context.bandColours[
    bandOfTile(context.params, context.firstTx + lx, context.firstTy + ly) - 1
  ]
}

/** The pad is plated metal: it keeps its flat colour, where rock and core get the noise shade. */
function shadeOf(context: BatchContext, cell: number, lx: number, ly: number): number {
  if (kindOfCell(cell) === CELL_KIND.indestructible) return 1
  return tileShadeOf(context.params.planetSeed, context.firstTx + lx, context.firstTy + ly)
}

function styleOf(cell: number): number {
  const kind = kindOfCell(cell)
  if (kind === CELL_KIND.ore) return TILE_STYLE.ore
  if (kind === CELL_KIND.core) return TILE_STYLE.core
  if (kind === CELL_KIND.indestructible) return TILE_STYLE.pad
  return TILE_STYLE.ground
}
