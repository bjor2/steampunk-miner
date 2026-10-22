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
 * - The drill's disc has a **bore wall** edge (GD lock on #662, Q1 b): its radius is the bore's,
 *   where the cut's contour lies, and it reaches half a density sample past it, full weight out to
 *   that reach minus one sample, then falling linearly in `d` to 0 at the reach. The one-sample
 *   band straddles the circle, so a cut that takes each sample down to the ramp its weight names
 *   (`boreWallTargetOf`) leaves its contour on the circle however the sample grid meets it, as the
 *   level floor's does. #36's soft rim, falling over the outer 29% of the radius and never past it,
 *   left the contour up to half a sample inside the circle, more than a 0.15 m clearance holds.
 * - A level cut's disc may carry a **floor band** (`floorBand.ts`, the same lock's Q2): the ground
 *   under its path, across the wheels' width, at full weight down to its level floor.
 */
import { circleExcessMm2Of } from './exactSquares'
import { isInFloorBand, type FloorBand } from './floorBand'
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
  /** How its weight falls off at the rim: #36's soft rim when left out. */
  edge?: DiscEdge
  /** A level cut's band under its path down to the floor (GD lock on #662, Q2); none when left out. */
  floorBand?: FloorBand
}

/** #36's soft rim, or the drill bore's wall straddling the radius (GD lock on #662). */
export type DiscEdge = 'soft' | 'boreWall'

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

/**
 * The density a cut that clears its whole bore leaves a sample at, from the weight a bore-walled
 * stamp gave it (ticket 570, `cutFront.ts`; the edge of the GD lock on #662): a ramp of
 * `128 + 255 (d - r) / 250` across the band straddling the radius, as the level floor ramps, so the
 * wall's contour lies on the stamp's circle and its diameter is the stamp's (the body plus its
 * clearance, #661). `d` is read back from the weight, the middle of its band; the full-weight core
 * is cleared.
 */
export function boreWallTargetOf(weight: number): number {
  if (weight >= FULL_WEIGHT) return 0
  // d - r = 250 (1/2 - (w + 1/2) / 256): the ramp's 255 per sample needs no millimetres.
  const target =
    ISO_DENSITY + Math.floor((SOLID_DENSITY * (FULL_WEIGHT - 2 * weight - 1)) / (2 * FULL_WEIGHT))
  return Math.max(0, Math.min(SOLID_DENSITY, target))
}

/** How far past its radius a bore-walled disc reaches: half a density sample. */
const BORE_WALL_REACH_PAST_MM = MM_PER_SAMPLE / 2

/** How far from its path a disc reaches: its radius, and half a sample more for a bore wall. */
export function reachMmOf(disc: Pick<DiscStamp, 'radiusMm' | 'edge'>): number {
  return disc.edge === 'boreWall' ? disc.radiusMm + BORE_WALL_REACH_PAST_MM : disc.radiusMm
}

/**
 * How far from its path the stamp's samples may lie: its reach, and a sample more under a floor
 * band, whose level floor sits up to a sample and a half under the wheels' line (`drillStamp.ts`).
 */
function boundMmOf(disc: DiscStamp): number {
  return disc.floorBand === undefined ? reachMmOf(disc) : reachMmOf(disc) + MM_PER_SAMPLE
}

/** A sample's step, or weight, when it lies past the reach. */
const OUTSIDE = -1

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
  const reach = boundMmOf(disc)
  return {
    first: Math.ceil((Math.min(disc.yMm, tail.yMm) - reach) / MM_PER_SAMPLE),
    last: Math.floor((Math.max(disc.yMm, tail.yMm) + reach) / MM_PER_SAMPLE),
  }
}

function stampColumnsOf(disc: DiscStamp): SampleRange {
  const tail = tailOf(disc)
  const reach = boundMmOf(disc)
  return {
    first: Math.ceil((Math.min(disc.xMm, tail.xMm) - reach) / MM_PER_SAMPLE),
    last: Math.floor((Math.max(disc.xMm, tail.xMm) + reach) / MM_PER_SAMPLE),
  }
}

/** Where the stamp's path starts: a capsule's tail, else its centre. */
export function tailOf(disc: DiscStamp): StampPoint {
  return isCapsule(disc) ? disc.tail : { xMm: disc.xMm, yMm: disc.yMm }
}

function isCapsule(disc: DiscStamp): disc is DiscStamp & { tail: StampPoint } {
  return disc.tail !== undefined && (disc.tail.xMm !== disc.xMm || disc.tail.yMm !== disc.yMm)
}

/** The stamp's sample at `(sx, sy)`, or null past its reach or where its level floor keeps it. */
export function stampSampleAt(disc: DiscStamp, sx: number, sy: number): WeightedSample | null {
  const weight = weightAt(disc, sx, sy)
  const floor = levelFloorAt(disc.floorRadiusMm, sx, sy)
  if (weight === OUTSIDE || floor === SOLID_DENSITY) return null
  return { sx, sy, weight, floor: Math.max(floor, wallFloorOf(disc, weight)) }
}

/**
 * A bore wall's sample is never cut below its ramp (`boreWallTargetOf`), on any path, so the cut's
 * contour stays on the bore's circle however long the stamp dwells; a soft rim's has no such floor.
 */
function wallFloorOf(disc: DiscStamp, weight: number): number {
  return disc.edge === 'boreWall' ? boreWallTargetOf(weight) : 0
}

/** Whether `(sx, sy)` lies within the stamp's reach of its path, whatever its level floor. */
export function isWithinStampAt(disc: DiscStamp, sx: number, sy: number): boolean {
  return weightAt(disc, sx, sy) !== OUTSIDE
}

/**
 * The falloff weight a bare soft-rimmed disc of `radiusMm` centred at `centre` gives the sample
 * at `(sx, sy)`, level floor aside: 0 past its radius (the swept cut's rim dwell, ticket 441).
 */
export function discWeightAt(centre: StampPoint, radiusMm: number, sx: number, sy: number): number {
  const dx = sx * MM_PER_SAMPLE - centre.xMm
  const dy = sy * MM_PER_SAMPLE - centre.yMm
  const step = stepOfRatio(dx * dx + dy * dy, radiusMm * radiusMm)
  return step === OUTSIDE ? 0 : FALLOFF[step]
}

/**
 * The sample's weight, or `OUTSIDE`, from its squared distance to the stamp's path as a ratio
 * `distanceSq / scale`: past either end of a capsule's segment the distance to that end, between
 * them `cross^2 / L^2`.
 */
/** A floor band's sample is the band's, at full weight down to its level floor, wall or no wall. */
function weightAt(disc: DiscStamp, sx: number, sy: number): number {
  if (isInBandOf(disc, sx, sy)) return FULL_WEIGHT
  return pathWeightAt(disc, sx, sy)
}

function isInBandOf(disc: DiscStamp, sx: number, sy: number): boolean {
  return disc.floorBand !== undefined && isInFloorBand(disc.floorBand, tailOf(disc), disc, sx, sy)
}

function pathWeightAt(disc: DiscStamp, sx: number, sy: number): number {
  if (!isCapsule(disc)) {
    const dx = sx * MM_PER_SAMPLE - disc.xMm
    const dy = sy * MM_PER_SAMPLE - disc.yMm
    return weightOfRatio(disc, dx * dx + dy * dy, 1)
  }
  const tail = disc.tail
  const segment = { x: disc.xMm - tail.xMm, y: disc.yMm - tail.yMm }
  const fromTail = { x: sx * MM_PER_SAMPLE - tail.xMm, y: sy * MM_PER_SAMPLE - tail.yMm }
  const along = fromTail.x * segment.x + fromTail.y * segment.y
  const lengthSq = segment.x * segment.x + segment.y * segment.y
  if (along <= 0) return weightOfRatio(disc, fromTail.x * fromTail.x + fromTail.y * fromTail.y, 1)
  if (along >= lengthSq) {
    const fromHead = { x: fromTail.x - segment.x, y: fromTail.y - segment.y }
    return weightOfRatio(disc, fromHead.x * fromHead.x + fromHead.y * fromHead.y, 1)
  }
  const cross = fromTail.x * segment.y - fromTail.y * segment.x
  return weightOfRatio(disc, cross * cross, lengthSq)
}

function weightOfRatio(disc: DiscStamp, distanceSq: number, scale: number): number {
  if (disc.edge === 'boreWall') return boreWallWeightOf(disc.radiusMm, distanceSq, scale)
  const step = stepOfRatio(distanceSq, disc.radiusMm * disc.radiusMm * scale)
  return step === OUTSIDE ? OUTSIDE : FALLOFF[step]
}

/**
 * A bore wall's weight at `d^2 = distanceSq / scale`: full out to the reach minus one sample, then
 * `floor(256 (reach - d) / 250)`, the one square root a sample in the band takes.
 */
function boreWallWeightOf(radiusMm: number, distanceSq: number, scale: number): number {
  const reach = radiusMm + BORE_WALL_REACH_PAST_MM
  const fullUpTo = reach - MM_PER_SAMPLE
  if (distanceSq > reach * reach * scale) return OUTSIDE
  if (distanceSq <= fullUpTo * fullUpTo * scale) return FULL_WEIGHT
  const distanceMm = Math.sqrt(distanceSq / scale)
  const weight = Math.floor((FULL_WEIGHT * (reach - distanceMm)) / MM_PER_SAMPLE)
  return Math.max(0, Math.min(FULL_WEIGHT - 1, weight))
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
 * A cell's samples the disc does not carve away, at full weight, each carved no lower than the
 * disc's level floor; the samples the floor keeps solid are left out. The disc carves the rest.
 */
export function cellSamplesBesideDisc(tile: TilePoint, disc: DiscStamp): WeightedSample[] {
  return cellSamplesOf(tile)
    .filter(({ sx, sy }) => !isCarvedAwayByDiscAt(disc, sx, sy))
    .map((sample) => ({ ...sample, floor: levelFloorAt(disc.floorRadiusMm, sample.sx, sample.sy) }))
    .filter((sample) => sample.floor !== SOLID_DENSITY)
}

/**
 * Whether the disc takes the sample away itself: anywhere within a soft rim's radius, but only in
 * a bore wall's full-weight core (ticket 662). A bore wall holds its band at the ramp that puts
 * the contour on its circle (`wallFloorOf`), and a gear cell beside the bore cuts past that
 * circle, so the band's samples in the cell are the cell's: left to the wall they stood as a
 * nub between the bore and a side cutter's cell.
 */
function isCarvedAwayByDiscAt(disc: DiscStamp, sx: number, sy: number): boolean {
  const weight = weightAt(disc, sx, sy)
  if (weight === OUTSIDE) return false
  return disc.edge !== 'boreWall' || weight === FULL_WEIGHT
}

/** The level floor's ramp at a sample: 128 on the floor circle, 255 a sample below it. */
function levelFloorAt(floorRadiusMm: number | null, sx: number, sy: number): number {
  if (floorRadiusMm === null) return 0
  const excess = circleExcessMm2Of(floorRadiusMm, sx * MM_PER_SAMPLE, sy * MM_PER_SAMPLE)
  const ramp =
    ISO_DENSITY + Math.floor((excess * SOLID_DENSITY) / (2 * floorRadiusMm * MM_PER_SAMPLE))
  return Math.max(0, Math.min(SOLID_DENSITY, ramp))
}
