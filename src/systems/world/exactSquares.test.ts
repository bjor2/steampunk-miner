import { describe, expect, it } from 'vitest'
import { centreDistanceFloorMmOf, circleExcessMm2Of } from './exactSquares'

/** R = 10^6 tiles in mm: the radius the ticket asks the authority to stay exact at (ticket 339). */
const MILLION_TILES_MM = 1_000_000_000

function bigFloorSqrt(s: bigint): bigint {
  let root = 0n
  let step = 1n << 40n
  while (step > 0n) {
    if ((root + step) * (root + step) <= s) root += step
    step >>= 1n
  }
  return root
}

const big = (mm: number) => BigInt(mm)

describe('exact squares', () => {
  it('gives the whole mm from the centre at R = 10^6 tiles where the double rounds up', () => {
    expect(Math.floor(Math.sqrt(MILLION_TILES_MM ** 2 + 100_000 ** 2))).toBe(1_000_000_005)
    expect(centreDistanceFloorMmOf(MILLION_TILES_MM, 100_000)).toBe(1_000_000_004)
  })

  it('gives the exact excess over a circle of R = 10^6 tiles where the double drifts', () => {
    const [x, y] = [600_000_250, 799_999_750]
    expect(MILLION_TILES_MM ** 2 - (x * x + y * y)).not.toBe(99_999_875_000)
    expect(circleExcessMm2Of(MILLION_TILES_MM, x, y)).toBe(99_999_875_000)
  })

  it('agrees with whole-number arithmetic all round a circle of R = 10^6 tiles', () => {
    for (let at = 0; at < 64; at++) {
      const x = Math.round(MILLION_TILES_MM * Math.cos(at / 10)) + at * 37
      const y = Math.round(MILLION_TILES_MM * Math.sin(at / 10)) - at * 53
      const sum = big(x) * big(x) + big(y) * big(y)
      expect(centreDistanceFloorMmOf(x, y)).toBe(Number(bigFloorSqrt(sum)))
      expect(circleExcessMm2Of(MILLION_TILES_MM, x, y)).toBe(
        Number(big(MILLION_TILES_MM) * big(MILLION_TILES_MM) - sum),
      )
    }
  })

  it('keeps the double values wherever the squares stay exact', () => {
    for (const [x, y] of [
      [0, 0],
      [12_345, -6_789],
      [-1_000_250, 3_000_500],
      [40_000_000, -20_000_000],
    ]) {
      expect(centreDistanceFloorMmOf(x, y)).toBe(Math.floor(Math.sqrt(x * x + y * y)))
      expect(circleExcessMm2Of(1_000_000, x, y)).toBe(1_000_000 * 1_000_000 - (x * x + y * y))
    }
  })

  it('keeps the sign of an excess too large to hold', () => {
    expect(circleExcessMm2Of(MILLION_TILES_MM, 0, 0)).toBe(Number.MAX_SAFE_INTEGER)
    expect(circleExcessMm2Of(0, MILLION_TILES_MM, 0)).toBe(-Number.MAX_SAFE_INTEGER)
  })
})
