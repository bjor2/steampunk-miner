import { describe, expect, it } from 'vitest'
import { unlinedDensitySum } from './cellYield'
import { casingRingAround, lineRing } from './casingLining'
import { carveDisc, clearDisc, type CellDrillTicks } from './groundEdit'
import { planetParamsFor } from './planetParams'
import { MM_PER_SAMPLE, chunkOfSample, localSampleOf, sampleIndexOf } from './sampleGrid'
import {
  currentCasingOfChunk,
  currentDensityOfChunk,
  EMPTY_WORLD,
  isTileYielded,
  type WorldState,
} from './worldState'

const params = planetParamsFor(83921, 1)
/** Deep band-1 rock, clear of caves (checked below). */
const CENTRE = { xMm: 500, yMm: 284000 }
const RING = casingRingAround(CENTRE.xMm, CENTRE.yMm)
const BOX = 8

function densityAt(world: WorldState, sx: number, sy: number): number {
  const density = currentDensityOfChunk(world, params, chunkOfSample(sx), chunkOfSample(sy))
  return density[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

function casingAt(world: WorldState, sx: number, sy: number): number {
  const casing = currentCasingOfChunk(world, chunkOfSample(sx), chunkOfSample(sy))
  return casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

/** Samples of a box round the ring's centre, with their squared distance from it in mm. */
function samplesNearCentre(): { sx: number; sy: number; distanceSq: number }[] {
  const csx = Math.round(CENTRE.xMm / MM_PER_SAMPLE)
  const csy = Math.round(CENTRE.yMm / MM_PER_SAMPLE)
  const samples = []
  for (let sy = csy - BOX; sy <= csy + BOX; sy++) {
    for (let sx = csx - BOX; sx <= csx + BOX; sx++) {
      const dx = sx * MM_PER_SAMPLE - CENTRE.xMm
      const dy = sy * MM_PER_SAMPLE - CENTRE.yMm
      samples.push({ sx, sy, distanceSq: dx * dx + dy * dy })
    }
  }
  return samples
}

function isInRing(distanceSq: number): boolean {
  const outer = RING.clearMm + RING.widthMm
  return distanceSq >= RING.clearMm * RING.clearMm && distanceSq < outer * outer
}

function touchesNativeGround(world: WorldState, sx: number, sy: number): boolean {
  const offsets = [-1, 0, 1]
  return offsets.some((dy) =>
    offsets.some(
      (dx) => densityAt(world, sx + dx, sy + dy) > 128 && casingAt(world, sx + dx, sy + dy) === 0,
    ),
  )
}

/** A round hole of 0.95 m radius, the drill's tunnel cross-section. */
function boredHole(): WorldState {
  const disc = { ...CENTRE, radiusMm: 950, floorRadiusMm: null }
  return clearDisc(EMPTY_WORLD, params, disc, 255).world
}

describe('casing lining', () => {
  it('starts from solid rock round the test point', () => {
    expect(samplesNearCentre().every(({ sx, sy }) => densityAt(EMPTY_WORLD, sx, sy) === 255)).toBe(
      true,
    )
  })

  it('lines every air sample of the ring that touches ground, one sample thick, at the grade', () => {
    const hole = boredHole()
    const lined = lineRing(hole, params, RING, 2)
    for (const { sx, sy, distanceSq } of samplesNearCentre()) {
      const shouldLine =
        isInRing(distanceSq) && densityAt(hole, sx, sy) <= 128 && touchesNativeGround(hole, sx, sy)
      expect(casingAt(lined.world, sx, sy)).toBe(shouldLine ? 2 : 0)
      expect(densityAt(lined.world, sx, sy)).toBe(shouldLine ? 255 : densityAt(hole, sx, sy))
    }
    expect(lined.placed).toBeGreaterThan(0)
    expect(lined.relined).toBe(0)
  })

  it('spans the stamp radius less and plus a quarter metre round the tunnel axis', () => {
    expect(RING).toEqual({ ...CENTRE, clearMm: 700, widthMm: 500 })
  })

  it('never lines on lining: rings half a metre apart keep the lining one sample thick', () => {
    const tunnel = clearDisc(
      boredHole(),
      params,
      { xMm: CENTRE.xMm + 500, yMm: CENTRE.yMm, radiusMm: 950, floorRadiusMm: null },
      255,
    ).world
    const first = lineRing(tunnel, params, RING, 2).world
    const second = lineRing(first, params, casingRingAround(CENTRE.xMm + 500, CENTRE.yMm), 2)
    const lined = samplesNearCentre().filter(({ sx, sy }) => casingAt(second.world, sx, sy) > 0)
    expect(lined.length).toBeGreaterThan(0)
    expect(lined.every(({ sx, sy }) => touchesNativeGround(second.world, sx, sy))).toBe(true)
  })

  it('lines a wall sample left at exactly the iso density, which the rule counts as air', () => {
    const edge = { xMm: 0, yMm: 1120 * MM_PER_SAMPLE, radiusMm: 100, floorRadiusMm: null }
    const halfCut = clearDisc(EMPTY_WORLD, params, edge, 127).world
    expect(densityAt(halfCut, 0, 1120)).toBe(128)
    const ring = { xMm: 0, yMm: 1120 * MM_PER_SAMPLE, clearMm: 0, widthMm: 100 }
    expect(lineRing(halfCut, params, ring, 1).placed).toBe(1)
  })

  it('never lines inside the clear radius, so the vehicle is never encased', () => {
    const lined = lineRing(lineRing(boredHole(), params, RING, 2).world, params, RING, 2)
    const inside = samplesNearCentre().filter(({ distanceSq }) => distanceSq < 700 * 700)
    expect(inside.every(({ sx, sy }) => densityAt(lined.world, sx, sy) === 0)).toBe(true)
  })

  it('raises lower-grade lining to the new grade when a ring passes again', () => {
    const weak = lineRing(boredHole(), params, RING, 2)
    const relined = lineRing(weak.world, params, RING, 4)
    expect(relined.relined).toBe(weak.placed)
    const grades = samplesNearCentre().map(({ sx, sy }) => casingAt(relined.world, sx, sy))
    expect(grades.filter((grade) => grade > 0).every((grade) => grade === 4)).toBe(true)
  })

  it('keeps a higher grade when a lower ring passes', () => {
    const strong = lineRing(boredHole(), params, RING, 5)
    const weak = lineRing(strong.world, params, RING, 2)
    expect(weak.relined).toBe(0)
    expect(samplesNearCentre().some(({ sx, sy }) => casingAt(weak.world, sx, sy) === 5)).toBe(true)
  })

  it('lines at grade 15 at most, the most a sample holds', () => {
    const lined = lineRing(boredHole(), params, RING, 40)
    const grades = samplesNearCentre().map(({ sx, sy }) => casingAt(lined.world, sx, sy))
    expect(Math.max(...grades)).toBe(15)
  })

  it('reports where it changed the ground', () => {
    expect(lineRing(boredHole(), params, RING, 1).changes.length).toBeGreaterThan(0)
  })
})

describe('casing and the yield rule', () => {
  /** Tile (0, 280): its bottom-left sample is (0, 1120). */
  const TILE = { tx: 0, ty: 280 }
  const sampleDisc = (sx: number, sy: number) => ({
    xMm: sx * MM_PER_SAMPLE,
    yMm: sy * MM_PER_SAMPLE,
    radiusMm: 100,
    floorRadiusMm: null,
  })
  const clearSamples = (world: WorldState, samples: readonly [number, number][]) =>
    samples.reduce(
      (current, [sx, sy]) => clearDisc(current, params, sampleDisc(sx, sy), 255).world,
      world,
    )

  /** Seven of the cell's sixteen samples drilled: 9 solid left, just above half. */
  const SEVEN: [number, number][] = [
    [0, 1120],
    [1, 1120],
    [2, 1120],
    [3, 1120],
    [0, 1121],
    [1, 1121],
    [2, 1121],
  ]

  it('never lets lining delay a cell yield: the eighth drilled sample still yields it', () => {
    const drilled = clearSamples(EMPTY_WORLD, SEVEN)
    const lining = { xMm: 0, yMm: 1120 * MM_PER_SAMPLE, clearMm: 0, widthMm: 1000 }
    const lined = lineRing(drilled, params, lining, 1)
    expect(lined.placed).toBe(7)
    expect(isTileYielded(lined.world, TILE)).toBe(false)
    expect(unlinedDensitySum(lined.world, params, TILE)).toBe(9 * 255)
    const eighth = clearDisc(lined.world, params, sampleDisc(3, 1121), 255)
    expect(eighth.yielded.map(({ tile }) => tile)).toEqual([TILE])
  })

  it('never yields a cell for lining it', () => {
    const drilled = clearSamples(EMPTY_WORLD, SEVEN)
    const lining = { xMm: 0, yMm: 1120 * MM_PER_SAMPLE, clearMm: 0, widthMm: 1000 }
    expect(lineRing(drilled, params, lining, 1).yielded).toEqual([])
  })
})

describe('re-drilling casing', () => {
  /** Rock clears in 24 ticks; lining of any grade in 48, so the two can be told apart. */
  const SLOWER_CASING: CellDrillTicks = (_tile, _material, casingGrade) =>
    casingGrade > 0 ? 48 : 24
  const WIDE = { ...CENTRE, radiusMm: 2000, floorRadiusMm: null }

  it('drills lining in the drill time of its grade, then clears its casing at air', () => {
    const lined = lineRing(boredHole(), params, RING, 3)
    const half = carveDisc(lined.world, params, WIDE, { firstTick: 0, ticks: 24 }, SLOWER_CASING)
    expect(half.casingCleared).toEqual({ samples: 0, grade: 0 })
    const linedSample = samplesNearCentre().find(({ sx, sy }) => casingAt(lined.world, sx, sy) > 0)
    if (linedSample === undefined) throw new Error('the ring lined nothing')
    expect(densityAt(half.world, linedSample.sx, linedSample.sy)).toBe(128)
    const through = carveDisc(half.world, params, WIDE, { firstTick: 24, ticks: 24 }, SLOWER_CASING)
    expect(through.casingCleared).toEqual({ samples: lined.placed, grade: 3 })
    expect(casingAt(through.world, linedSample.sx, linedSample.sy)).toBe(0)
    expect(densityAt(through.world, linedSample.sx, linedSample.sy)).toBe(0)
  })
})
