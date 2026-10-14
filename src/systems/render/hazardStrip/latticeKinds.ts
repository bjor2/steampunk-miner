/**
 * The coarse tiers of the hazard strip (TD scope g 4 on #316, ticket 341): what a lattice block or
 * a band may hold, from the seed alone, never fewer kinds than it holds (conservative: a pip that
 * isn't quite there, never a hazard missed).
 *
 * - Tier 3, a lattice block (the 8-tile cave lattice of `baseTerrain.ts`): caves are lattice noise
 *   blended bilinearly between the block's four corners, so no tile's noise tops the highest
 *   corner, and a block may hold a cave only where that corner reaches the cave threshold. Lava is
 *   asked of every pocket block over it (`lavaPockets.ts`), the core and the cache by distance.
 * - Tier 4, a band: caves from band 2, lava where the band has pockets, the core in band 5, the
 *   cache in its band.
 */
import { hashCell } from '../../cellRandom'
import { LAVA_POCKET_TILES } from '../../../constants/balance'
import { CAVE_LATTICE_TILES, FIRST_CAVE_BAND } from '../../world/baseTerrain'
import { SEED_PURPOSE, subSeedFor } from '../../world/generatorSeeds'
import { isLavaPocketBand, lavaPocketTestOf } from '../../world/lavaPockets'
import type { PlanetParams } from '../../world/planetParams'
import { BAND_COUNT, bandOfTile, isInsidePlanet } from '../../world/planetGeometry'
import { halfTileDistanceSq, halfTileRadiusSq, type TilePoint } from '../../world/tileGrid'
import { STRIP_KIND } from './stripHits'

/** The seed-only answers of one planet, worked out once. */
export interface LatticeKinds {
  params: PlanetParams
  caveSeed: number
  isLavaPocket: (tile: TilePoint) => boolean
  cacheTile: TilePoint
  surfaceSq: number
  coreSq: number
  /** The outer edge of band 2, as a squared half-tile radius: caves lie at or inside it. */
  caveBandSq: number
  /** What each band 1 to 5 may hold, at index band - 1. */
  bandKinds: readonly number[]
}

const CORNER_BITS_DROPPED = 16
const CORNER_MAX = 0xffff
const BASIS_POINTS = 10000
const POCKET_MIDDLE = Math.floor(LAVA_POCKET_TILES / 2)
const BANDS = [1, 2, 3, 4, 5]

export function latticeKindsOf(params: PlanetParams, cacheTile: TilePoint): LatticeKinds {
  const isLavaPocket = lavaPocketTestOf(params)
  return {
    params,
    caveSeed: subSeedFor(params, SEED_PURPOSE.cave),
    isLavaPocket,
    cacheTile,
    surfaceSq: halfTileRadiusSq(params.radiusTiles),
    coreSq: halfTileRadiusSq(params.coreRadiusTiles),
    caveBandSq: params.bandStartsHalfTileSq[FIRST_CAVE_BAND - 2],
    bandKinds: BANDS.map((band) => bandKindsOf(params, cacheTile, band)),
  }
}

/** Tier 3: what the lattice block holding `tile` may hold, from the seed. */
export function blockKindsOf(lattice: LatticeKinds, tile: TilePoint): number {
  const x0 = Math.floor(tile.tx / CAVE_LATTICE_TILES) * CAVE_LATTICE_TILES
  const y0 = Math.floor(tile.ty / CAVE_LATTICE_TILES) * CAVE_LATTICE_TILES
  const [nearSq, farSq] = distanceRangeSqOf(x0, y0)
  if (nearSq > lattice.surfaceSq) return 0
  return (
    coreKindOf(lattice, nearSq) |
    caveKindOf(lattice, x0, y0, nearSq, farSq) |
    lavaKindOf(lattice, x0, y0) |
    cacheKindOf(lattice, x0, y0)
  )
}

/** Tier 4: what the band of `tile` may hold; nothing off the disc. */
export function bandKindsAt(lattice: LatticeKinds, tile: TilePoint): number {
  if (!isInsidePlanet(lattice.params, tile.tx, tile.ty)) return 0
  return lattice.bandKinds[bandOfTile(lattice.params, tile.tx, tile.ty) - 1]
}

function bandKindsOf(params: PlanetParams, cacheTile: TilePoint, band: number): number {
  const isCaveBand = band >= FIRST_CAVE_BAND && params.caveThresholdBp <= BASIS_POINTS
  return (
    (isCaveBand ? STRIP_KIND.void : 0) |
    (isLavaPocketBand(params, band) ? STRIP_KIND.lava : 0) |
    (band === BAND_COUNT ? STRIP_KIND.core : 0) |
    (bandOfTile(params, cacheTile.tx, cacheTile.ty) === band ? STRIP_KIND.cache : 0)
  )
}

/** The nearest and farthest squared half-tile distances of the block's tiles from the centre. */
function distanceRangeSqOf(x0: number, y0: number): [number, number] {
  const x1 = x0 + CAVE_LATTICE_TILES - 1
  const y1 = y0 + CAVE_LATTICE_TILES - 1
  const near = halfTileDistanceSq(nearestToZero(x0, x1), nearestToZero(y0, y1))
  const far = Math.max(
    halfTileDistanceSq(x0, y0),
    halfTileDistanceSq(x1, y0),
    halfTileDistanceSq(x0, y1),
    halfTileDistanceSq(x1, y1),
  )
  return [near, far]
}

/** The tile of `[first, last]` whose centre lies nearest the planet's centre line. */
function nearestToZero(first: number, last: number): number {
  return Math.min(Math.max(-1, first), last)
}

function coreKindOf(lattice: LatticeKinds, nearSq: number): number {
  return nearSq <= lattice.coreSq ? STRIP_KIND.core : 0
}

function caveKindOf(
  lattice: LatticeKinds,
  x0: number,
  y0: number,
  nearSq: number,
  farSq: number,
): number {
  const isCaveGround = nearSq <= lattice.caveBandSq && farSq > lattice.coreSq
  if (!isCaveGround) return 0
  return highestCornerBpOf(lattice.caveSeed, x0, y0) >= lattice.params.caveThresholdBp
    ? STRIP_KIND.void
    : 0
}

/** The block's highest corner as noise basis points: no blended tile inside it reads higher. */
function highestCornerBpOf(seed: number, x0: number, y0: number): number {
  const gx = x0 / CAVE_LATTICE_TILES
  const gy = y0 / CAVE_LATTICE_TILES
  const highest = Math.max(
    hashCell(seed, gx, gy) >>> CORNER_BITS_DROPPED,
    hashCell(seed, gx + 1, gy) >>> CORNER_BITS_DROPPED,
    hashCell(seed, gx, gy + 1) >>> CORNER_BITS_DROPPED,
    hashCell(seed, gx + 1, gy + 1) >>> CORNER_BITS_DROPPED,
  )
  return Math.floor((highest * BASIS_POINTS) / CORNER_MAX)
}

/** Lava where any pocket block over the lattice block fires, asked at the pocket's middle tile. */
function lavaKindOf(lattice: LatticeKinds, x0: number, y0: number): number {
  const first = { bx: Math.floor(x0 / LAVA_POCKET_TILES), by: Math.floor(y0 / LAVA_POCKET_TILES) }
  const last = {
    bx: Math.floor((x0 + CAVE_LATTICE_TILES - 1) / LAVA_POCKET_TILES),
    by: Math.floor((y0 + CAVE_LATTICE_TILES - 1) / LAVA_POCKET_TILES),
  }
  for (let by = first.by; by <= last.by; by++) {
    for (let bx = first.bx; bx <= last.bx; bx++) {
      if (isPocketFired(lattice, bx, by)) return STRIP_KIND.lava
    }
  }
  return 0
}

function isPocketFired(lattice: LatticeKinds, bx: number, by: number): boolean {
  const middle = {
    tx: bx * LAVA_POCKET_TILES + POCKET_MIDDLE,
    ty: by * LAVA_POCKET_TILES + POCKET_MIDDLE,
  }
  return lattice.isLavaPocket(middle)
}

function cacheKindOf(lattice: LatticeKinds, x0: number, y0: number): number {
  const { tx, ty } = lattice.cacheTile
  const isInside =
    tx >= x0 && tx < x0 + CAVE_LATTICE_TILES && ty >= y0 && ty < y0 + CAVE_LATTICE_TILES
  return isInside ? STRIP_KIND.cache : 0
}
