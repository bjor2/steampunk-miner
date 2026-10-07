/**
 * The shapes the ground is carved with (decision #36 Carving), integer arithmetic only:
 *
 * - A **disc** covers the samples whose position (in mm, as poses are) lies within its radius,
 *   weighted by a precomputed falloff: full weight out to `1/sqrt(2)` of the radius, then falling
 *   linearly in `d^2` to 0 at the rim, so the rim is soft and the contour smooth.
 * - A disc may have a **level floor**: a radius from the planet's centre below which it leaves the
 *   ground. Samples near that circle are carved only down to the ramp the generated surface uses,
 *   `128 + 255 (R^2 - r^2) / 2R` per sample, so the cut floor's contour lies on the circle itself,
 *   however the sample grid meets it (`drillStamp.ts` says why the drill wants one).
 * - A **cell** stamp covers one material cell's 16 samples at full weight (scripted mining).
 * - A cell **beside a disc** (slice drill gear, ticket 234) covers the cell's samples the disc does
 *   not reach, at full weight, kept above the disc's level floor, so a widened bore keeps its floor.
 */
import { MM_PER_SAMPLE, SAMPLES_PER_TILE, SOLID_DENSITY, ISO_DENSITY } from './sampleGrid'
import type { TilePoint } from './tileGrid'

/** A disc in mm around a world point. */
export interface DiscStamp {
  xMm: number
  yMm: number
  radiusMm: number
  /** The level floor's radius from the planet's centre, or null for a whole disc. */
  floorRadiusMm: number | null
}

export interface WeightedSample {
  sx: number
  sy: number
  weight: number
  /** The density a carve leaves at least: 0, or the level floor's ramp. */
  floor: number
}

/** Full weight of the falloff table. */
export const FULL_WEIGHT = 256
const FALLOFF_STEPS = 64
const FULL_WEIGHT_UP_TO_STEP = 32
/** Weight by `floor(64 d^2 / r^2)`: full inside `d^2 <= r^2 / 2`, then linear to 0 at the rim. */
const FALLOFF: readonly number[] = Array.from({ length: FALLOFF_STEPS + 1 }, (_, step) =>
  step <= FULL_WEIGHT_UP_TO_STEP
    ? FULL_WEIGHT
    : Math.floor((FULL_WEIGHT * (FALLOFF_STEPS - step)) / (FALLOFF_STEPS - FULL_WEIGHT_UP_TO_STEP)),
)

/** The samples a disc can carve, with their falloff weights and floors, in row order. */
export function discSamplesOf(disc: DiscStamp): WeightedSample[] {
  const samples: WeightedSample[] = []
  const radiusSq = disc.radiusMm * disc.radiusMm
  const sy0 = Math.ceil((disc.yMm - disc.radiusMm) / MM_PER_SAMPLE)
  const sy1 = Math.floor((disc.yMm + disc.radiusMm) / MM_PER_SAMPLE)
  const sx0 = Math.ceil((disc.xMm - disc.radiusMm) / MM_PER_SAMPLE)
  const sx1 = Math.floor((disc.xMm + disc.radiusMm) / MM_PER_SAMPLE)
  for (let sy = sy0; sy <= sy1; sy++) {
    for (let sx = sx0; sx <= sx1; sx++) {
      const dx = sx * MM_PER_SAMPLE - disc.xMm
      const dy = sy * MM_PER_SAMPLE - disc.yMm
      const distanceSq = dx * dx + dy * dy
      const floor = levelFloorAt(disc.floorRadiusMm, sx, sy)
      if (distanceSq > radiusSq || floor === SOLID_DENSITY) continue
      const weight = FALLOFF[Math.floor((FALLOFF_STEPS * distanceSq) / radiusSq)]
      samples.push({ sx, sy, weight, floor })
    }
  }
  return samples
}

/** One material cell's own samples at full weight. */
export function cellSamplesOf(tile: TilePoint): WeightedSample[] {
  const samples: WeightedSample[] = []
  for (let qy = 0; qy < SAMPLES_PER_TILE; qy++) {
    for (let qx = 0; qx < SAMPLES_PER_TILE; qx++) {
      samples.push({
        sx: tile.tx * SAMPLES_PER_TILE + qx,
        sy: tile.ty * SAMPLES_PER_TILE + qy,
        weight: FULL_WEIGHT,
        floor: 0,
      })
    }
  }
  return samples
}

/**
 * A cell's samples outside the disc's radius at full weight, each carved no lower than the disc's
 * level floor; the samples the floor keeps solid are left out. The disc carves the rest.
 */
export function cellSamplesBesideDisc(tile: TilePoint, disc: DiscStamp): WeightedSample[] {
  return cellSamplesOf(tile)
    .filter((sample) => !isWithinDisc(disc, sample))
    .map((sample) => ({ ...sample, floor: levelFloorAt(disc.floorRadiusMm, sample.sx, sample.sy) }))
    .filter((sample) => sample.floor !== SOLID_DENSITY)
}

function isWithinDisc(disc: DiscStamp, { sx, sy }: WeightedSample): boolean {
  const dx = sx * MM_PER_SAMPLE - disc.xMm
  const dy = sy * MM_PER_SAMPLE - disc.yMm
  return dx * dx + dy * dy <= disc.radiusMm * disc.radiusMm
}

/** The level floor's ramp at a sample: 128 on the floor circle, 255 a sample below it. */
function levelFloorAt(floorRadiusMm: number | null, sx: number, sy: number): number {
  if (floorRadiusMm === null) return 0
  const x = sx * MM_PER_SAMPLE
  const y = sy * MM_PER_SAMPLE
  const excess = floorRadiusMm * floorRadiusMm - (x * x + y * y)
  const ramp =
    ISO_DENSITY + Math.floor((excess * SOLID_DENSITY) / (2 * floorRadiusMm * MM_PER_SAMPLE))
  return Math.max(0, Math.min(SOLID_DENSITY, ramp))
}
