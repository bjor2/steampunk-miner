import { describe, expect, it } from 'vitest'
import { ISO_DENSITY, MM_PER_SAMPLE, SOLID_DENSITY } from './sampleGrid'
import { discSamplesOf, type DiscStamp, type WeightedSample } from './stampShape'

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

const RADIUS_MM = 950
const HEAD: DiscStamp = { xMm: 4310, yMm: 280_120, radiusMm: RADIUS_MM, floorRadiusMm: null }

function keyOf({ sx, sy }: WeightedSample): string {
  return `${sx},${sy}`
}

function weightsOf(samples: readonly WeightedSample[]): Map<string, number> {
  return new Map(samples.map((sample) => [keyOf(sample), sample.weight]))
}

/** The float distance from a sample to the segment, for checking only. */
function distanceToSegment(sample: WeightedSample, tail: DiscStamp['tail'], head: DiscStamp) {
  const px = sample.sx * MM_PER_SAMPLE
  const py = sample.sy * MM_PER_SAMPLE
  const ax = tail?.xMm ?? head.xMm
  const ay = tail?.yMm ?? head.yMm
  const vx = head.xMm - ax
  const vy = head.yMm - ay
  const lengthSq = vx * vx + vy * vy
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / lengthSq))
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy))
}

describe('swept capsule stamp (ticket 330)', () => {
  it('is the disc when the tail sits on the centre', () => {
    const capsule = { ...HEAD, tail: { xMm: HEAD.xMm, yMm: HEAD.yMm } }
    expect(discSamplesOf(capsule)).toEqual(discSamplesOf(HEAD))
  })

  it.each([
    [300, 0],
    [0, -300],
    [-212, -212],
    [137, 260],
  ])('covers every disc along a %i, %i mm sweep at no less weight', (dx, dy) => {
    const tail = { xMm: HEAD.xMm - dx, yMm: HEAD.yMm - dy }
    const capsule = weightsOf(discSamplesOf({ ...HEAD, tail }))
    for (let step = 0; step <= 10; step++) {
      const xMm = tail.xMm + Math.round((dx * step) / 10)
      const yMm = tail.yMm + Math.round((dy * step) / 10)
      for (const sample of discSamplesOf({ ...HEAD, xMm, yMm })) {
        expect(capsule.get(keyOf(sample))).toBeGreaterThanOrEqual(sample.weight)
      }
    }
  })

  it('holds no sample farther than its radius from the path', () => {
    const tail = { xMm: HEAD.xMm - 290, yMm: HEAD.yMm + 70 }
    const samples = discSamplesOf({ ...HEAD, tail })
    expect(samples.length).toBeGreaterThan(discSamplesOf(HEAD).length)
    for (const sample of samples) {
      expect(distanceToSegment(sample, tail, HEAD)).toBeLessThanOrEqual(RADIUS_MM)
    }
  })

  it('weighs a sample beside the segment as a disc centred at its foot on the path', () => {
    const tail = { xMm: HEAD.xMm - 1000, yMm: HEAD.yMm }
    const capsule = weightsOf(discSamplesOf({ ...HEAD, tail }))
    const footX = 4000
    const disc = discSamplesOf({ ...HEAD, xMm: footX })
    const column = disc.filter((sample) => sample.sx * MM_PER_SAMPLE === footX)
    expect(column.length).toBeGreaterThan(0)
    for (const sample of column) expect(capsule.get(keyOf(sample))).toBe(sample.weight)
  })
})
