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
 * - A disc with a **tail** is the swept cut's **capsule** (ticket 330): every sample within the
 *   radius of the segment from the tail to the centre, weighted by its distance to that segment as
 *   a disc weighs its distance to the centre. Inside the segment's span the distance is
 *   `cross^2 / L^2`, compared and indexed without a division until the one floor, so it stays
 *   exact. A tail on the centre is the disc.
 */
import { circleExcessMm2Of } from './exactSquares'
import { MM_PER_SAMPLE, SAMPLES_PER_TILE, SOLID_DENSITY, ISO_DENSITY } from './sampleGrid'
import type { TilePoint } from './tileGrid'

/** A disc in mm around a world point. */
export interface DiscStamp {
  xMm: number
  yMm: number
  radiusMm: number
  /** The level floor's radius from the planet's centre, or null for a whole disc. */
  floorRadiusMm: number | null
  /** Where the swept cut started (ticket 330): the stamp is then a capsule from here to the centre. */
  tail?: StampPoint
}

/** A point of a stamp's path, in mm. */
export interface StampPoint {
  xMm: number
  yMm: number
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

/** A sample's step when it lies past the radius. */
const OUTSIDE = FALLOFF_STEPS + 1

/** The samples a disc (or a capsule) can carve, with their falloff weights and floors, in row order. */
export function discSamplesOf(disc: DiscStamp): WeightedSample[] {
  const samples: WeightedSample[] = []
  const rows = stampRowsOf(disc)
  const columns = stampColumnsOf(disc)
  for (let sy = rows.first; sy <= rows.last; sy++) {
    for (let sx = columns.first; sx <= columns.last; sx++) {
      const sample = stampSampleAt(disc, sx, sy)
      if (sample !== null) samples.push(sample)
    }
  }
  return samples
}

/** Sample rows or columns, both ends included. */
export interface SampleRange {
  first: number
  last: number
}

/** The sample rows the stamp's bounding square covers. */
export function stampRowsOf(disc: DiscStamp): SampleRange {
  const tail = tailOf(disc)
  return {
    first: Math.ceil((Math.min(disc.yMm, tail.yMm) - disc.radiusMm) / MM_PER_SAMPLE),
    last: Math.floor((Math.max(disc.yMm, tail.yMm) + disc.radiusMm) / MM_PER_SAMPLE),
  }
}

function stampColumnsOf(disc: DiscStamp): SampleRange {
  const tail = tailOf(disc)
  return {
    first: Math.ceil((Math.min(disc.xMm, tail.xMm) - disc.radiusMm) / MM_PER_SAMPLE),
    last: Math.floor((Math.max(disc.xMm, tail.xMm) + disc.radiusMm) / MM_PER_SAMPLE),
  }
}

/** Where the stamp's path starts: a capsule's tail, else its centre. */
export function tailOf(disc: DiscStamp): StampPoint {
  return isCapsule(disc) ? disc.tail : { xMm: disc.xMm, yMm: disc.yMm }
}

function isCapsule(disc: DiscStamp): disc is DiscStamp & { tail: StampPoint } {
  return disc.tail !== undefined && (disc.tail.xMm !== disc.xMm || disc.tail.yMm !== disc.yMm)
}

/** The stamp's sample at `(sx, sy)`, or null past its radius or where its level floor keeps it. */
export function stampSampleAt(disc: DiscStamp, sx: number, sy: number): WeightedSample | null {
  const step = falloffStepAt(disc, sx, sy)
  const floor = levelFloorAt(disc.floorRadiusMm, sx, sy)
  if (step === OUTSIDE || floor === SOLID_DENSITY) return null
  return { sx, sy, weight: FALLOFF[step], floor }
}

/** Whether `(sx, sy)` lies within the stamp's radius of its path, whatever its level floor. */
export function isWithinStampAt(disc: DiscStamp, sx: number, sy: number): boolean {
  return falloffStepAt(disc, sx, sy) !== OUTSIDE
}

function falloffStepAt(disc: DiscStamp, sx: number, sy: number): number {
  if (isCapsule(disc)) return falloffStepFromSegment(disc, disc.tail, sx, sy)
  const radiusSq = disc.radiusMm * disc.radiusMm
  return stepOfDistanceSq(sx * MM_PER_SAMPLE - disc.xMm, sy * MM_PER_SAMPLE - disc.yMm, radiusSq)
}

/**
 * `floor(64 d^2 / r^2)` for the sample's distance `d` to the segment from the tail to the centre:
 * past either end the distance to that end, between them `cross^2 / L^2`; `OUTSIDE` past the radius.
 */
function falloffStepFromSegment(disc: DiscStamp, tail: StampPoint, sx: number, sy: number): number {
  const radiusSq = disc.radiusMm * disc.radiusMm
  const segment = { x: disc.xMm - tail.xMm, y: disc.yMm - tail.yMm }
  const fromTail = { x: sx * MM_PER_SAMPLE - tail.xMm, y: sy * MM_PER_SAMPLE - tail.yMm }
  const along = fromTail.x * segment.x + fromTail.y * segment.y
  const lengthSq = segment.x * segment.x + segment.y * segment.y
  if (along <= 0) return stepOfDistanceSq(fromTail.x, fromTail.y, radiusSq)
  if (along >= lengthSq) {
    return stepOfDistanceSq(fromTail.x - segment.x, fromTail.y - segment.y, radiusSq)
  }
  const cross = fromTail.x * segment.y - fromTail.y * segment.x
  return stepOfRatio(cross * cross, radiusSq * lengthSq)
}

function stepOfDistanceSq(dx: number, dy: number, radiusSq: number): number {
  return stepOfRatio(dx * dx + dy * dy, radiusSq)
}

/** The falloff step of `d^2 / r^2` given as a ratio, or `OUTSIDE` when it is over 1. */
function stepOfRatio(distanceSq: number, radiusSq: number): number {
  if (distanceSq > radiusSq) return OUTSIDE
  return Math.floor((FALLOFF_STEPS * distanceSq) / radiusSq)
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
    .filter(({ sx, sy }) => !isWithinStampAt(disc, sx, sy))
    .map((sample) => ({ ...sample, floor: levelFloorAt(disc.floorRadiusMm, sample.sx, sample.sy) }))
    .filter((sample) => sample.floor !== SOLID_DENSITY)
}

/** The level floor's ramp at a sample: 128 on the floor circle, 255 a sample below it. */
function levelFloorAt(floorRadiusMm: number | null, sx: number, sy: number): number {
  if (floorRadiusMm === null) return 0
  const excess = circleExcessMm2Of(floorRadiusMm, sx * MM_PER_SAMPLE, sy * MM_PER_SAMPLE)
  const ramp =
    ISO_DENSITY + Math.floor((excess * SOLID_DENSITY) / (2 * floorRadiusMm * MM_PER_SAMPLE))
  return Math.max(0, Math.min(SOLID_DENSITY, ramp))
}
