import { describe, expect, it } from 'vitest'
import { ISO_DENSITY, MM_PER_SAMPLE, SOLID_DENSITY } from './sampleGrid'
import {
  boreWallTargetOf,
  cellSamplesBesideDisc,
  discSamplesOf,
  FULL_WEIGHT,
  reachMmOf,
  type DiscStamp,
  type WeightedSample,
} from './stampShape'

/** R = 10^6 tiles in mm (ticket 339): every square of a pose there is past 2^53. */
const MILLION_TILES_MM = 1_000_000_000

/** `a / b` floored, for a positive `b`. */
function flooredOf(a: bigint, b: bigint): bigint {
  return a >= 0n ? a / b : -((-a + b - 1n) / b)
}

/**
 * The level floor's ramp per sample in whole numbers, from `s = (R² - r²) / 2R` (ticket 662):
 * `128 * 250 / (250 - s)` under the circle, `(128 * 250 + 255 s) / (250 + s)` over it, 255 and 0
 * past half a sample.
 */
function exactRampAt(floorRadiusMm: number, sx: number, sy: number): number {
  const radius = BigInt(floorRadiusMm)
  const [x, y] = [BigInt(sx * MM_PER_SAMPLE), BigInt(sy * MM_PER_SAMPLE)]
  const excess = radius * radius - x * x - y * y
  const sampleScale = 2n * radius * BigInt(MM_PER_SAMPLE)
  if (2n * excess >= sampleScale) return SOLID_DENSITY
  if (2n * excess <= -sampleScale) return 0
  const isoScale = BigInt(ISO_DENSITY) * sampleScale
  const ramp =
    excess >= 0n
      ? flooredOf(isoScale, sampleScale - excess)
      : flooredOf(isoScale + BigInt(SOLID_DENSITY) * excess, sampleScale + excess)
  return Math.max(0, Math.min(SOLID_DENSITY, Number(ramp)))
}

/**
 * How far, in mm, a level floor of `floorRadiusMm` lays its contour off its circle down column
 * `sx`, read linearly between the samples either side of the circle; a sample its floor keeps
 * solid is not carved, so it reads 255.
 */
function floorContourMissOf(floorRadiusMm: number, sx: number): number {
  const xMm = sx * MM_PER_SAMPLE
  const circleYMm = Math.sqrt(floorRadiusMm * floorRadiusMm - xMm * xMm)
  const disc = { xMm, yMm: Math.round(circleYMm) + 300, radiusMm: 950, floorRadiusMm }
  const samples = discSamplesOf(disc)
  const floorAt = (sy: number) =>
    samples.find((sample) => sample.sx === sx && sample.sy === sy)?.floor ?? SOLID_DENSITY
  const row = Math.floor(circleYMm / MM_PER_SAMPLE)
  const [under, over] = [floorAt(row), floorAt(row + 1)]
  const contourYMm = (row + (under - ISO_DENSITY) / (under - over)) * MM_PER_SAMPLE
  return Math.abs(contourYMm - circleYMm)
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

  // A level floor 290 m out, read down each column of samples over its first 25 m from the top,
  // where the circle meets the rows at every phase and runs within 4 degrees of them: the
  // straight ramp's contour ran up to 21 mm off it (ticket 662).
  it('lays a level floor contour within 2 mm of its circle wherever the circle meets the rows', () => {
    const misses = Array.from({ length: 101 }, (_, sx) => floorContourMissOf(290_000, sx))
    expect(misses.filter((missMm) => missMm > 2)).toEqual([])
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

describe('bore-walled disc (GD lock on #662, Q1 b)', () => {
  // Column-centred at x = 20.5 m: samples sit every 250 mm, at 0, 250 and 500 mm from the axis.
  const BORE: DiscStamp = {
    xMm: 20_500,
    yMm: 280_000,
    radiusMm: 600,
    floorRadiusMm: null,
    edge: 'boreWall',
  }
  const AXIS_SX = Math.round(BORE.xMm / MM_PER_SAMPLE)
  const ROW = BORE.yMm / MM_PER_SAMPLE
  const weightAcross = (samples: number) =>
    discSamplesOf(BORE).find(({ sx, sy }) => sx === AXIS_SX + samples && sy === ROW)?.weight

  it('weighs its core in full out to one sample inside its radius', () => {
    // Off-column centres put a sample 350 mm (the 600 mm radius less 250) and 375 mm out.
    const weightOut = (centreXMm: number, outMm: number) =>
      discSamplesOf({ ...BORE, xMm: centreXMm }).find(
        ({ sx, sy }) => sx * MM_PER_SAMPLE === centreXMm + outMm && sy === ROW,
      )?.weight
    expect(weightAcross(0)).toBe(FULL_WEIGHT)
    expect(weightAcross(1)).toBe(FULL_WEIGHT)
    expect(weightOut(20_400, 350)).toBe(FULL_WEIGHT)
    expect(weightOut(20_375, 375)).toBeLessThan(FULL_WEIGHT)
  })

  it('reaches half a sample past its radius, a soft rim never past it', () => {
    expect(reachMmOf(BORE)).toBe(BORE.radiusMm + MM_PER_SAMPLE / 2)
    expect(reachMmOf({ ...BORE, edge: 'soft' })).toBe(BORE.radiusMm)
    expect(weightAcross(2)).toBeGreaterThan(0)
    expect(weightAcross(2)).toBeLessThan(FULL_WEIGHT)
    expect(weightAcross(3)).toBeUndefined()
  })

  it('never cuts a wall sample below the ramp that lays the contour on its circle', () => {
    const wall = discSamplesOf(BORE).find(({ sx, sy }) => sx === AXIS_SX + 2 && sy === ROW)
    expect(wall?.floor).toBe(boreWallTargetOf(wall?.weight ?? 0))
    // 500 mm out, 100 mm inside the 600 mm circle: open, but not to nothing.
    expect(wall?.floor).toBeGreaterThan(0)
    expect(wall?.floor).toBeLessThan(ISO_DENSITY)
  })

  it('ramps the wall across one sample from open to solid round its radius', () => {
    expect(boreWallTargetOf(FULL_WEIGHT)).toBe(0)
    // Half a sample inside the circle is open, half a sample past it solid, the iso on it.
    const weightAt = (outMm: number) =>
      Math.floor((FULL_WEIGHT * (BORE.radiusMm + 125 - outMm)) / 375)
    expect(boreWallTargetOf(weightAt(BORE.radiusMm - 125))).toBe(0)
    expect(boreWallTargetOf(weightAt(BORE.radiusMm))).toBe(ISO_DENSITY - 1)
    expect(boreWallTargetOf(0)).toBeGreaterThanOrEqual(SOLID_DENSITY - 1)
  })

  it('leaves a gear cell beside it its wall band to cut, and keeps its full-weight core', () => {
    const besideTile = { tx: 21, ty: BORE.yMm / 1000 }
    const keys = cellSamplesBesideDisc(besideTile, BORE).map(keyOf)
    // Column 21 starts at x = 21.0 m, the wall band's sample 500 mm from the axis.
    expect(keys).toContain(`${AXIS_SX + 2},${ROW}`)
    const inner = cellSamplesBesideDisc({ tx: 20, ty: BORE.yMm / 1000 }, BORE).map(keyOf)
    expect(inner).not.toContain(`${AXIS_SX},${ROW}`)
  })
})
