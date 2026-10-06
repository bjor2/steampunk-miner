/**
 * One chunk's tiles as instance data for a single batched draw (#4 Rendering, #13, #36): every
 * tile the ground's surface can cross becomes one instance with its local position, its shaded
 * band colour and its ore look. The shader cuts each quad along the density contour at 128 (the
 * chunk's density halo, `densityHalo.ts`) and draws the edge highlight along it, so the ground
 * reads as the smooth surface the vehicle collides with. Colours come from the material, drilled
 * or not; a tile of space or cave air the surface ramps into takes its band's ground colour.
 * Tiles stay aligned to the world, never to the screen, so the look holds at any camera rotation.
 *
 * An ore tile with air within `ORE_WHISPER_ROCK_TILES` of it is flagged for `ore_whisper`'s rim
 * (#46); the shader lights the flag only while the player holds the artefact, so holding it never
 * rebuilds a chunk. The halo reaches one sample into the right and upper neighbours, so a tile on
 * those edges sees less of them than the whisper's 1 m: presentation only, never a rule.
 *
 * Heat planets (#113, #114): a lava cell draws as molten rock with its own style, and a ground
 * tile holding refractory lining is flagged in the same slot as the whisper flag, so the shader
 * draws it as firebrick with glowing joints.
 */
import { GROUND_BLOCK_SIZE, ORE_WHISPER_ROCK_TILES } from '../../constants/scene'
import type { PlanetParams } from '../world/planetParams'
import { bandOfTile } from '../world/planetGeometry'
import { ISO_DENSITY, SAMPLES_PER_TILE } from '../world/sampleGrid'
import { CHUNK_CELLS, CHUNK_SIZE, firstTileOfChunk } from '../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../world/worldCell'
import { DENSITY_HALO_SIDE } from './densityHalo'
import { BLOCKS_PER_CHUNK, BLOCKS_PER_CHUNK_SIDE, type BlockedTileInstances } from './groundBlocks'
import { ART_DIRECTION, type BandPalette } from './artDirection'
import { bandColourOf, paletteOf, tileShadeOf } from './bandPalette'
import type { Rgb } from './colour'
import { oreLookProvider, type OreLookProvider } from '../registries/oreLook'
import type { OreLook } from './oreLook'

/** How the shader draws a tile. */
export const TILE_STYLE = { ground: 0, ore: 1, core: 2, pad: 3, artefactCache: 4, lava: 5 } as const

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
  /** The `ore-visuals` slice's look, else the kernel's (feature-slices.md 3.9), read per chunk. */
  oreLook: OreLookProvider
  /** 1 per cell holding refractory lining (#113), in cell order. */
  refractoryCells: Uint8Array
}

const NO_ORE: Rgb = [0, 0, 0]
/** No cell lined with refractory: what a chunk without the lining passes. */
export const NO_REFRACTORY_CELLS: Uint8Array = new Uint8Array(CHUNK_CELLS)
const BANDS = [1, 2, 3, 4, 5]

/**
 * `cells` are the chunk's material cells; `halo` its density halo; `refractoryCells` marks the
 * cells holding refractory lining.
 */
export function buildChunkTileBatch(
  params: PlanetParams,
  cx: number,
  cy: number,
  cells: Uint32Array,
  halo: Uint8Array,
  refractoryCells: Uint8Array = NO_REFRACTORY_CELLS,
): ChunkTileBatch {
  const context = { ...batchContextOf(params, cx, cy, cells), refractoryCells }
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
      if (hasGroundIn(halo, lx, ly)) writeTile(batch, context, halo, lx, ly)
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

/** Whether any sample within the whisper's rock depth of the tile's square is air. */
function isNearAir(halo: Uint8Array, lx: number, ly: number): boolean {
  const reach = ORE_WHISPER_ROCK_TILES * SAMPLES_PER_TILE
  const last = DENSITY_HALO_SIDE - 1
  const [x0, x1] = [
    Math.max(0, lx * SAMPLES_PER_TILE - reach),
    Math.min(last, (lx + 1) * SAMPLES_PER_TILE + reach),
  ]
  const [y0, y1] = [
    Math.max(0, ly * SAMPLES_PER_TILE - reach),
    Math.min(last, (ly + 1) * SAMPLES_PER_TILE + reach),
  ]
  for (let qy = y0; qy <= y1; qy++) {
    for (let qx = x0; qx <= x1; qx++) {
      if (halo[qy * DENSITY_HALO_SIDE + qx] < ISO_DENSITY) return true
    }
  }
  return false
}

function batchContextOf(
  params: PlanetParams,
  cx: number,
  cy: number,
  cells: Uint32Array,
): Omit<BatchContext, 'refractoryCells'> {
  const palette = paletteOf(params.paletteId)
  return {
    params,
    palette,
    bandColours: BANDS.map((band) => bandColourOf(palette, band)),
    cells,
    firstTx: firstTileOfChunk(cx),
    firstTy: firstTileOfChunk(cy),
    oreLooks: new Map(),
    oreLook: oreLookProvider(),
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

function writeTile(
  batch: ChunkTileBatch,
  context: BatchContext,
  halo: Uint8Array,
  lx: number,
  ly: number,
): void {
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
  writeVector(batch.styles, at * 4, styleOf(cell), tileFlagOf(context, halo, cell, ore, lx, ly))
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

/** An ore tile's whisper rim (#46), or a ground tile's refractory lining (#113). */
function tileFlagOf(
  context: BatchContext,
  halo: Uint8Array,
  cell: number,
  ore: OreLook | null,
  lx: number,
  ly: number,
): number {
  if (ore !== null) return isNearAir(halo, lx, ly) ? 1 : 0
  return styleOf(cell) === TILE_STYLE.ground ? context.refractoryCells[ly * CHUNK_SIZE + lx] : 0
}

function oreLookOf(context: BatchContext, cell: number): OreLook {
  const known = context.oreLooks.get(cell)
  if (known !== undefined) return known
  const look = context.oreLook.oreLookOfCell(context.params, cell)
  context.oreLooks.set(cell, look)
  return look
}

function baseColourOf(context: BatchContext, cell: number, lx: number, ly: number): Rgb {
  const kind = kindOfCell(cell)
  if (kind === CELL_KIND.indestructible) return context.palette.pad
  if (kind === CELL_KIND.core || kind === CELL_KIND.lava) return context.palette.core
  if (kind === CELL_KIND.artefactCache) return ART_DIRECTION.artefactCache
  return context.bandColours[
    bandOfTile(context.params, context.firstTx + lx, context.firstTy + ly) - 1
  ]
}

/** The pad and the cache are metal: they keep their flat colour, rock and core get the shade. */
function shadeOf(context: BatchContext, cell: number, lx: number, ly: number): number {
  if (isMetalCell(cell)) return 1
  return tileShadeOf(context.params.planetSeed, context.firstTx + lx, context.firstTy + ly)
}

/** Metal and molten lava keep their flat colour (#113: lava glows, it is not shaded rock). */
function isMetalCell(cell: number): boolean {
  const kind = kindOfCell(cell)
  return (
    kind === CELL_KIND.indestructible || kind === CELL_KIND.artefactCache || kind === CELL_KIND.lava
  )
}

function styleOf(cell: number): number {
  const kind = kindOfCell(cell)
  if (kind === CELL_KIND.lava) return TILE_STYLE.lava
  if (kind === CELL_KIND.artefactCache) return TILE_STYLE.artefactCache
  if (kind === CELL_KIND.ore) return TILE_STYLE.ore
  if (kind === CELL_KIND.core) return TILE_STYLE.core
  if (kind === CELL_KIND.indestructible) return TILE_STYLE.pad
  return TILE_STYLE.ground
}
