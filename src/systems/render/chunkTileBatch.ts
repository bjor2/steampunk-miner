/**
 * One chunk's tiles as instance data for a single batched draw (#4 Rendering, #13): every solid
 * tile becomes one instance with its local position, its shaded band colour, its ore look and a
 * 4-neighbour edge mask for the edge highlight. Tiles stay aligned to the world, never to the
 * screen, so the look holds at any camera rotation. Air and space draw nothing.
 */
import type { PlanetParams } from '../world/planetParams'
import { bandOfTile } from '../world/planetGeometry'
import { CHUNK_CELLS, CHUNK_SIZE, firstTileOfChunk } from '../world/tileGrid'
import { CELL_KIND, isSolidCell, kindOfCell } from '../world/worldCell'
import type { BandPalette } from './artDirection'
import { bandColourOf, paletteOf, tileShadeOf } from './bandPalette'
import type { Rgb } from './colour'
import { oreLookOfCell, type OreLook } from './oreLook'

/** How the shader draws a tile. */
export const TILE_STYLE = { ground: 0, ore: 1, core: 2, pad: 3 } as const

/** Bits of the edge mask: the side of the tile that touches air or space. */
export const EDGE = { right: 1, left: 2, up: 4, down: 8 } as const

/** The ore decal's shape code in the shader: 0 for a tile without ore. */
export const SILHOUETTE_CODE = { none: 0, flecks: 1, shards: 2 } as const

/** Instance attributes, `count` tiles long; arrays are sized for a full chunk. */
export interface ChunkTileBatch {
  count: number
  /** 2 per tile: the tile's x and y inside the chunk. */
  tiles: Float32Array
  /** 3 per tile: the ground or core colour, already shaded. */
  baseColours: Float32Array
  /** 4 per tile: ore colour and glow (zeros without ore). */
  oreColours: Float32Array
  /** 4 per tile: style, edge mask, silhouette code, sparkle count. */
  styles: Float32Array
}

/** The cell at a tile outside the chunk, for the edge mask along the chunk's border. */
export type CellOutside = (tx: number, ty: number) => number

interface BatchContext {
  params: PlanetParams
  palette: BandPalette
  /** Bands 1 to 5, mixed once per chunk. */
  bandColours: readonly Rgb[]
  cells: Uint32Array
  firstTx: number
  firstTy: number
  cellOutside: CellOutside
  oreLooks: Map<number, OreLook>
}

const NO_ORE: Rgb = [0, 0, 0]
const BANDS = [1, 2, 3, 4, 5]

export function buildChunkTileBatch(
  params: PlanetParams,
  cx: number,
  cy: number,
  cells: Uint32Array,
  cellOutside: CellOutside,
): ChunkTileBatch {
  const context = batchContextOf(params, cx, cy, cells, cellOutside)
  const batch = emptyBatch()
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      if (isSolidCell(cells[ly * CHUNK_SIZE + lx])) writeTile(batch, context, lx, ly)
    }
  }
  return batch
}

function batchContextOf(
  params: PlanetParams,
  cx: number,
  cy: number,
  cells: Uint32Array,
  cellOutside: CellOutside,
): BatchContext {
  const palette = paletteOf(params.paletteId)
  return {
    params,
    palette,
    bandColours: BANDS.map((band) => bandColourOf(palette, band)),
    cells,
    firstTx: firstTileOfChunk(cx),
    firstTy: firstTileOfChunk(cy),
    cellOutside,
    oreLooks: new Map(),
  }
}

function emptyBatch(): ChunkTileBatch {
  return {
    count: 0,
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
  writeVector(batch.styles, at * 4, styleOf(cell), edgeMaskOf(context, lx, ly))
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

function edgeMaskOf(context: BatchContext, lx: number, ly: number): number {
  return (
    airSideBit(context, lx + 1, ly, EDGE.right) |
    airSideBit(context, lx - 1, ly, EDGE.left) |
    airSideBit(context, lx, ly + 1, EDGE.up) |
    airSideBit(context, lx, ly - 1, EDGE.down)
  )
}

function airSideBit(context: BatchContext, lx: number, ly: number, bit: number): number {
  return isSolidCell(neighbourCell(context, lx, ly)) ? 0 : bit
}

function neighbourCell(context: BatchContext, lx: number, ly: number): number {
  const isInside = lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE
  if (isInside) return context.cells[ly * CHUNK_SIZE + lx]
  return context.cellOutside(context.firstTx + lx, context.firstTy + ly)
}
