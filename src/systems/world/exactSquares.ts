/**
 * Squares of planet-centred millimetres, exact at any planet radius (ticket 339, #316 scope e).
 * A pose's `x² + y²` in mm passes 2^53, past which doubles no longer hold every integer, once the
 * planet's radius passes about 94.9 km (and `floor(sqrt)` can round up from 67.1 km). Up to 2^26 mm
 * per coordinate the double maths is exact and stays the path every planet so far takes; past it
 * the same values come from BigInt, so the authority carves the same ground on every machine at
 * any radius. Nothing else changes: the coordinates stay integer mm from the planet's centre.
 */

/** 2^26 mm: each square stays under 2^52, so a sum or difference of two stays under 2^53. */
const EXACT_COORDINATE_MM = 67_108_864

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

/** `floor(sqrt(x² + y²))`: the whole mm from the planet's centre to a point. */
export function centreDistanceFloorMmOf(xMm: number, yMm: number): number {
  if (areSquaresExact(xMm, yMm)) return floorSqrtOf(xMm * xMm + yMm * yMm)
  return Number(bigFloorSqrtOf(bigSquareOf(xMm) + bigSquareOf(yMm)))
}

/**
 * `R² - (x² + y²)`: how far inside the circle of radius `R` a point lies, in mm². Exact wherever
 * the answer is a safe integer; a larger one keeps its sign and stops at 2^53 - 1, far past where
 * any ramp read from it saturates.
 */
export function circleExcessMm2Of(radiusMm: number, xMm: number, yMm: number): number {
  if (isExactWithin(radiusMm, xMm, yMm)) return radiusMm * radiusMm - (xMm * xMm + yMm * yMm)
  return safeNumberOf(bigSquareOf(radiusMm) - (bigSquareOf(xMm) + bigSquareOf(yMm)))
}

function areSquaresExact(xMm: number, yMm: number): boolean {
  return isExactCoordinate(xMm) && isExactCoordinate(yMm)
}

function isExactWithin(radiusMm: number, xMm: number, yMm: number): boolean {
  return isExactCoordinate(radiusMm) && areSquaresExact(xMm, yMm)
}

function isExactCoordinate(mm: number): boolean {
  return Math.abs(mm) <= EXACT_COORDINATE_MM
}

/** For `s` up to 2^53: the correctly rounded root can round up to the next whole number. */
function floorSqrtOf(s: number): number {
  const root = Math.floor(Math.sqrt(s))
  return root * root > s ? root - 1 : root
}

/** The double's root lands within a step or two of the answer; whole-number steps finish it. */
function bigFloorSqrtOf(s: bigint): bigint {
  let root = BigInt(Math.floor(Math.sqrt(Number(s))))
  while (root * root > s) root -= 1n
  while ((root + 1n) * (root + 1n) <= s) root += 1n
  return root
}

function bigSquareOf(mm: number): bigint {
  const big = BigInt(mm)
  return big * big
}

function safeNumberOf(value: bigint): number {
  if (value > MAX_SAFE) return Number.MAX_SAFE_INTEGER
  if (value < -MAX_SAFE) return -Number.MAX_SAFE_INTEGER
  return Number(value)
}
