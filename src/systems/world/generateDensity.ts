/**
 * The generated density of one chunk (decision #36 Model): 255 inside solid ground, 0 in air,
 * with the two generated edges smooth from the start so the contour at 128 is round, not stepped:
 *
 * - the planet's surface ramps across one sample around the radius `R`: `128 + 255 * (R^2 - d^2) /
 *   2R` in sample units, which is 128 exactly at `d = R`;
 * - cave walls ramp with the same lattice noise that decides cave tiles, `128 + 255 * (T - n) /
 *   CAVE_EDGE_BP`, so a tile is a cave exactly when its corner sample is at or under 128.
 *
 * The dock pad is solid and its clearance empty, sample for sample, as tiles placed over the
 * terrain (#8). Integer arithmetic only, so every machine generates the same bytes.
 */
import { FIRST_CAVE_BAND, caveNoiseOfChunk } from './baseTerrain'
import { dockSiteOf, type DockSite } from './dockSite'
import { noiseBpAtSample, type ChunkNoise } from './latticeNoise'
import type { PlanetParams } from './planetParams'
import { bandAtHalfTileDistanceSq } from './planetGeometry'
import {
  AIR_DENSITY,
  CHUNK_SAMPLES,
  CHUNK_SAMPLE_SIDE,
  ISO_DENSITY,
  SAMPLES_PER_TILE,
  SOLID_DENSITY,
  firstSampleOfChunk,
  sampleIndexOf,
} from './sampleGrid'
import {
  CHUNK_SIZE,
  chunkOfTile,
  firstTileOfChunk,
  halfTileDistanceSq,
  halfTileRadiusSq,
} from './tileGrid'
import { CELL_KIND, kindOfCell } from './worldCell'

/** Cave noise this many basis points under the threshold is fully solid. Placeholder, by eye. */
const CAVE_EDGE_BP = 400

type CaveSpan = 'solid' | 'air' | 'wall'

const CAVE_SPAN = { solid: SOLID_DENSITY, air: AIR_DENSITY } as const

interface DensityContext {
  params: PlanetParams
  cx: number
  cy: number
  cells: Uint32Array
  caveNoise: ChunkNoise
  /** The radius in samples, and its square. */
  radiusSamples: number
  radiusSamplesSq: number
  isWhollyInsideSurface: boolean
}

export function generateDensity(
  params: PlanetParams,
  cx: number,
  cy: number,
  cells: Uint32Array,
): Uint8Array {
  const context = densityContextOf(params, cx, cy, cells)
  const density = new Uint8Array(CHUNK_SAMPLES)
  for (let ly = 0; ly < CHUNK_SIZE; ly++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) writeTileDensity(density, context, lx, ly)
  }
  stampDockDensity(density, dockSiteOf(params), cx, cy)
  return density
}

function densityContextOf(
  params: PlanetParams,
  cx: number,
  cy: number,
  cells: Uint32Array,
): DensityContext {
  const radiusSamples = params.radiusTiles * SAMPLES_PER_TILE
  return {
    params,
    cx,
    cy,
    cells,
    caveNoise: caveNoiseOfChunk(params, cx, cy),
    radiusSamples,
    radiusSamplesSq: radiusSamples * radiusSamples,
    isWhollyInsideSurface: isChunkInsideSurface(params, cx, cy),
  }
}

/** Every corner of the chunk is over a tile inside the surface, so no surface ramp reaches it. */
function isChunkInsideSurface(params: PlanetParams, cx: number, cy: number): boolean {
  const inner = halfTileRadiusSq(params.radiusTiles - 2)
  const x0 = firstTileOfChunk(cx)
  const y0 = firstTileOfChunk(cy)
  const x1 = x0 + CHUNK_SIZE - 1
  const y1 = y0 + CHUNK_SIZE - 1
  return [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ].every(([tx, ty]) => halfTileDistanceSq(tx, ty) <= inner)
}

function writeTileDensity(
  density: Uint8Array,
  context: DensityContext,
  lx: number,
  ly: number,
): void {
  const cave = hasCaveWallsAt(context, lx, ly) ? caveSpanOfTile(context, lx, ly) : 'solid'
  if (cave !== 'wall' && context.isWhollyInsideSurface) {
    fillTileSamples(density, lx, ly, CAVE_SPAN[cave])
    return
  }
  for (let qy = 0; qy < SAMPLES_PER_TILE; qy++) {
    for (let qx = 0; qx < SAMPLES_PER_TILE; qx++) {
      const lsx = lx * SAMPLES_PER_TILE + qx
      const lsy = ly * SAMPLES_PER_TILE + qy
      const caveDensity = cave === 'wall' ? caveDensityAt(context, lsx, lsy) : CAVE_SPAN[cave]
      density[sampleIndexOf(lsx, lsy)] = Math.min(caveDensity, surfaceDensityAt(context, lsx, lsy))
    }
  }
}

/**
 * The noise is bilinear inside a lattice square and a tile's samples never straddle one, so the
 * tile's four corner samples bound all sixteen: most tiles are wholly rock or wholly cave, and
 * only wall tiles need the noise per sample.
 */
function caveSpanOfTile(context: DensityContext, lx: number, ly: number): CaveSpan {
  const last = SAMPLES_PER_TILE - 1
  const x = lx * SAMPLES_PER_TILE
  const y = ly * SAMPLES_PER_TILE
  const corners = [
    caveDensityAt(context, x, y),
    caveDensityAt(context, x + last, y),
    caveDensityAt(context, x, y + last),
    caveDensityAt(context, x + last, y + last),
  ]
  if (corners.every((value) => value === SOLID_DENSITY)) return 'solid'
  if (corners.every((value) => value === AIR_DENSITY)) return 'air'
  return 'wall'
}

/** Caves exist in bands 2 to 5 outside the core (#4), as in the tile terrain. */
function hasCaveWallsAt(context: DensityContext, lx: number, ly: number): boolean {
  if (kindOfCell(context.cells[ly * CHUNK_SIZE + lx]) === CELL_KIND.core) return false
  const distanceSq = halfTileDistanceSq(
    firstTileOfChunk(context.cx) + lx,
    firstTileOfChunk(context.cy) + ly,
  )
  return bandAtHalfTileDistanceSq(context.params, distanceSq) >= FIRST_CAVE_BAND
}

function caveDensityAt(context: DensityContext, lsx: number, lsy: number): number {
  const noise = noiseBpAtSample(context.caveNoise, lsx, lsy, SAMPLES_PER_TILE)
  const excess = context.params.caveThresholdBp - noise
  return clampDensity(ISO_DENSITY + Math.floor((excess * SOLID_DENSITY) / CAVE_EDGE_BP))
}

function surfaceDensityAt(context: DensityContext, lsx: number, lsy: number): number {
  if (context.isWhollyInsideSurface) return SOLID_DENSITY
  const sx = firstSampleOfChunk(context.cx) + lsx
  const sy = firstSampleOfChunk(context.cy) + lsy
  const excess = context.radiusSamplesSq - (sx * sx + sy * sy)
  return clampDensity(
    ISO_DENSITY + Math.floor((excess * SOLID_DENSITY) / (2 * context.radiusSamples)),
  )
}

function clampDensity(value: number): number {
  return Math.max(AIR_DENSITY, Math.min(SOLID_DENSITY, value))
}

/**
 * The pad is solid and the clearance empty in every sample of their tiles, including clearance
 * tiles past the disc, where the surface ramp would otherwise leave a lip over the pad.
 */
function stampDockDensity(density: Uint8Array, site: DockSite, cx: number, cy: number): void {
  for (let tx = site.firstColumn; tx <= site.lastColumn; tx++) {
    for (let ty = site.padRow; ty <= site.clearanceTopRow; ty++) {
      if (chunkOfTile(tx) !== cx || chunkOfTile(ty) !== cy) continue
      const value = ty === site.padRow ? SOLID_DENSITY : AIR_DENSITY
      fillTileSamples(density, tx - firstTileOfChunk(cx), ty - firstTileOfChunk(cy), value)
    }
  }
}

function fillTileSamples(density: Uint8Array, lx: number, ly: number, value: number): void {
  for (let qy = 0; qy < SAMPLES_PER_TILE; qy++) {
    const row = (ly * SAMPLES_PER_TILE + qy) * CHUNK_SAMPLE_SIDE + lx * SAMPLES_PER_TILE
    density.fill(value, row, row + SAMPLES_PER_TILE)
  }
}
