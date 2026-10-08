import { describe, expect, it } from 'vitest'
import { discSamplesOf } from './stampShape'
import { ISO_DENSITY, MM_PER_SAMPLE, SOLID_DENSITY } from './sampleGrid'

/** R = 10^6 tiles in mm (ticket 339): every square of a pose there is past 2^53. */
const MILLION_TILES_MM = 1_000_000_000

/** The level floor's ramp `128 + 255 (R² - r²) / 2R` per sample, in whole numbers. */
function exactRampAt(floorRadiusMm: number, sx: number, sy: number): number {
  const radius = BigInt(floorRadiusMm)
  const [x, y] = [BigInt(sx * MM_PER_SAMPLE), BigInt(sy * MM_PER_SAMPLE)]
  const scaled = (radius * radius - x * x - y * y) * BigInt(SOLID_DENSITY)
  const divisor = 2n * radius * BigInt(MM_PER_SAMPLE)
  const floored = scaled >= 0n ? scaled / divisor : -((-scaled + divisor - 1n) / divisor)
  return Math.max(0, Math.min(SOLID_DENSITY, ISO_DENSITY + Number(floored)))
}

describe('stamp shapes', () => {
  it('ramps a level floor from the exact square excess at R = 10^6 tiles', () => {
    const disc = {
      xMm: 123_457,
      yMm: MILLION_TILES_MM + 300,
      radiusMm: 950,
      floorRadiusMm: MILLION_TILES_MM,
    }
    const samples = discSamplesOf(disc)
    expect(samples.some((sample) => sample.floor > 0 && sample.floor < SOLID_DENSITY)).toBe(true)
    for (const { sx, sy, floor } of samples)
      expect(floor).toBe(exactRampAt(disc.floorRadiusMm, sx, sy))
  })
})
