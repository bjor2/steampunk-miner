import { describe, expect, it } from 'vitest'
import { FUSE_BUILD_PEAK } from './blastLookConstants'
import { fuseBuildOf } from './fuseBuild'

describe('fuse-spark build (D8 #868)', () => {
  it('keeps the row rate while the fuse has more than three seconds to burn', () => {
    expect(fuseBuildOf(600)).toBe(1)
    expect(fuseBuildOf(180)).toBe(1)
  })

  it('builds to the peak at the last tick, half way at half the build', () => {
    expect(fuseBuildOf(0)).toBe(FUSE_BUILD_PEAK)
    expect(fuseBuildOf(90)).toBeCloseTo(1 + (FUSE_BUILD_PEAK - 1) / 2, 6)
  })

  it('never builds a remote charge, which has no fuse', () => {
    expect(fuseBuildOf(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('rises as the fuse runs down', () => {
    const factors = [180, 120, 60, 30, 0].map(fuseBuildOf)
    expect([...factors].sort((a, b) => a - b)).toEqual(factors)
  })
})
