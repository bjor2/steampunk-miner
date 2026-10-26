/**
 * A blast's disc (D1 #860: the GD's 04:50 amendment, the TD's radius rows and the Vertical
 * Scaler's "stamp the disc from an integer fixed-point r²"). A blast is the record {centre, i, L,
 * blastSeq}: its charge tile, its rung `size` with that rung's radius `radiusMm` (L_i, whole
 * half-tiles), the planter's Blast Radius level `radiusLevel` read at detonation, and the session's
 * `blastSeq`. Both squared radii are derived from it, once per blast, as BigInt in half-tiles scaled
 * by the track's divisor d (16 in data), and no float is ever stored:
 *
 *   base r²    (2 L_i)² d            self hit, the radius + 1 interlock and the back-out test
 *   ground r²  (2 L_i)² (d + L)      the cells, ore and collapse rim it clears: r = L_i √(1 + L/d)
 *
 * A tile is in the ground disc when its centre's squared offset from the charge tile's centre,
 * (2 dx)² + (2 dy)² half-tiles scaled by d, is at most the ground r², taken no larger than the
 * planet's diameter squared: where the disc meets the planet, not a gameplay clamp. At L = 0 the
 * ground disc is the shipped radius's, tile for tile.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { ECONOMY } from '../../economy/economy'
import { fromBigInt, toSafeInteger } from '../../money'
import type { BlastEvent } from '../../registries/blastEffects'
import type { PlanetParams } from '../../world/planetParams'

/** What the disc is derived from: the blast's rung radius and the planter's level. */
export type BlastDisc = Pick<BlastEvent, 'radiusMm' | 'radiusLevel'>

/**
 * The level of a rig that owns no Blast Radius level, and of a live blast from a save made before
 * the disc record: its blast is its rung's. D9 (#869) sells the owned level, read at detonation
 * (`vehicleCharges.ts` `blastRadiusLevelOf`).
 */
export const UNOWNED_RADIUS_LEVEL = 0

const HALF_TILE_MM = MM_PER_METRE / 2
const HALF_TILES_PER_TILE = 2n
const MM2_PER_TILE2 = BigInt(MM_PER_METRE * MM_PER_METRE)

/** `2 L_i`: the rung's radius in whole half-tiles. */
export function halfTileRadiusOf(radiusMm: number): number {
  if (radiusMm % HALF_TILE_MM !== 0) {
    throw new RangeError(`a blast radius is whole half-tiles, got ${radiusMm} mm`)
  }
  return radiusMm / HALF_TILE_MM
}

/** Whether a blast radius in mm is whole half-tiles, as every rung of the ladder is. */
export function isHalfTileRadius(radiusMm: unknown): radiusMm is number {
  return (
    typeof radiusMm === 'number' &&
    Number.isSafeInteger(radiusMm) &&
    radiusMm >= 0 &&
    radiusMm % HALF_TILE_MM === 0
  )
}

/** `(2 L_i)² d`: the danger zone's r², which no level grows. */
export function baseR2Of(disc: BlastDisc): bigint {
  return halfTileSquareOf(disc) * levelDivisor()
}

/** `(2 L_i)² (d + L)`: the ground the blast clears, before it meets the planet's edge. */
export function groundR2Of(disc: BlastDisc): bigint {
  return halfTileSquareOf(disc) * (levelDivisor() + BigInt(disc.radiusLevel))
}

/** The ground r² where the disc meets the planet: no larger than its diameter squared. */
export function groundR2OnPlanetOf(disc: BlastDisc, params: PlanetParams): bigint {
  const ground = groundR2Of(disc)
  const diameter = planetDiameterR2Of(params)
  return ground < diameter ? ground : diameter
}

/** The squared tile offset `dx² + dy²` the ground disc reaches, a plain integer per cell test. */
export function groundTilesSqOf(disc: BlastDisc, params: PlanetParams): number {
  return toSafeInteger(fromBigInt(groundR2OnPlanetOf(disc, params) / tileR2Scale()))
}

/** The squared tile offset a rung of radius `radiusMm` reaches at level 0, whatever the planet. */
export function baseTilesSqOf(radiusMm: number): number {
  return toSafeInteger(fromBigInt(baseR2Of({ radiusMm, radiusLevel: 0 }) / tileR2Scale()))
}

/**
 * The ground disc's reach in whole mm, rounded out: the rim's, the prefetch's and the flash's
 * radius. At level 0 it is the rung's radius exactly.
 */
export function groundRadiusMmOf(disc: BlastDisc, params: PlanetParams): number {
  const mm2 = ceilDiv(groundR2OnPlanetOf(disc, params) * MM2_PER_TILE2, tileR2Scale())
  return toSafeInteger(fromBigInt(ceilSqrtOf(mm2)))
}

/** The planet's diameter `2 R` tiles as a scaled r²: `(4 R)² d` in half-tiles. */
function planetDiameterR2Of(params: PlanetParams): bigint {
  const diameterHalfTiles = BigInt(params.radiusTiles) * HALF_TILES_PER_TILE * HALF_TILES_PER_TILE
  return diameterHalfTiles * diameterHalfTiles * levelDivisor()
}

/** One tile² in the scaled half-tile units: `2² d`. */
function tileR2Scale(): bigint {
  return HALF_TILES_PER_TILE * HALF_TILES_PER_TILE * levelDivisor()
}

function halfTileSquareOf(disc: BlastDisc): bigint {
  const halfTiles = BigInt(halfTileRadiusOf(disc.radiusMm))
  return halfTiles * halfTiles
}

function levelDivisor(): bigint {
  return BigInt(ECONOMY.blastingCharges.radiusTrack.levelDivisor)
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator
}

/** The least whole root whose square reaches `n`: Newton's integer step from above, exact. */
function ceilSqrtOf(n: bigint): bigint {
  const floorRoot = floorSqrtOf(n)
  return floorRoot * floorRoot === n ? floorRoot : floorRoot + 1n
}

function floorSqrtOf(n: bigint): bigint {
  if (n < 2n) return n
  let root = n
  let next = (root + 1n) / 2n
  while (next < root) {
    root = next
    next = (root + n / root) / 2n
  }
  return root
}
