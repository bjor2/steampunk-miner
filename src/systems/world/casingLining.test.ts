import { describe, expect, it } from 'vitest'
import { CASING_RING_SPACING_MM } from '../../constants/balance'
import { drillStampRadiusMm } from '../vehicle/drillBore'
import { drillStampOf, stampSweptFrom } from '../vehicle/drillStamp'
import { FACING, type VehiclePose } from '../vehicle/vehiclePose'
import { cellDensitySum } from './cellYield'
import {
  casingRingAlong,
  casingRingAround,
  cellWallSamplesOf,
  lineRing,
  ringSamplesOf,
  type CasingRing,
} from './casingLining'
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

/** The planet's up at the centre, 1024-scaled: (2, 1024) this far out on the y axis. */
const UP = { x: 2, y: 1024 }

function isInAnnulus(sx: number, sy: number): boolean {
  const dx = sx * MM_PER_SAMPLE - CENTRE.xMm
  const dy = sy * MM_PER_SAMPLE - CENTRE.yMm
  const distanceSq = dx * dx + dy * dy
  const outer = RING.clearMm + RING.widthMm
  return distanceSq >= RING.clearMm * RING.clearMm && distanceSq < outer * outer
}

/** In the annulus round the centre, or in its floor box: under it, 1.2 m deep, the wheels' width. */
function isInRing(sx: number, sy: number): boolean {
  const dx = sx * MM_PER_SAMPLE - CENTRE.xMm
  const dy = sy * MM_PER_SAMPLE - CENTRE.yMm
  const depth = -(dx * UP.x + dy * UP.y)
  const across = Math.abs(dx * UP.y - dy * UP.x)
  const isInFloorBox = depth > 0 && depth <= 1200 * 1024 && across <= 450 * 1024
  return isInAnnulus(sx, sy) || isInFloorBox
}

function touchesAir(world: WorldState, sx: number, sy: number): boolean {
  const neighbours: [number, number][] = [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
  ]
  return neighbours.some(([dx, dy]) => densityAt(world, sx + dx, sy + dy) <= 128)
}

/** Whether every sample of the box keeps the density it had in `before`. */
function keepsDensity(before: WorldState, after: WorldState): boolean {
  return samplesNearCentre().every(
    ({ sx, sy }) => densityAt(after, sx, sy) === densityAt(before, sx, sy),
  )
}

/** A round hole of the stamp's radius, the drill's tunnel cross-section, its wall on the circle. */
function boredHole(): WorldState {
  const disc = { ...CENTRE, radiusMm: drillStampRadiusMm(), floorRadiusMm: null }
  return clearDisc(EMPTY_WORLD, params, { ...disc, edge: 'boreWall' }, 255).world
}

/**
 * A level tunnel's axis where its floor lies deepest: the wheels 0.45 m under it round down to a
 * floor circle 0.68 m under, so its first solid sample is 0.93 m under, past the annulus's 0.85.
 */
const LEVEL_AXIS = { xMm: 500, yMm: 284_429 }

/** A level tunnel along the axis as a pose report facing right cuts it (lift 0 at 0.15 m). */
function levelTunnel(): WorldState {
  const pose: VehiclePose = {
    x: LEVEL_AXIS.xMm,
    y: LEVEL_AXIS.yMm,
    vx: 0,
    vy: 0,
    upx: 2,
    upy: 1024,
    facing: FACING.right,
  }
  const stamp = drillStampOf(pose, false)
  const tail = { xMm: LEVEL_AXIS.xMm - 3000, yMm: stamp.yMm }
  const head = { ...stamp, xMm: LEVEL_AXIS.xMm + 1500 }
  return clearDisc(EMPTY_WORLD, params, stampSweptFrom(head, tail), 255).world
}

/** The tunnel floor's wall samples under the axis, within the wheels' half width: rock beside air. */
function floorSamplesUnder(world: WorldState, axis: { xMm: number; yMm: number }) {
  const floor = []
  for (
    let sy = Math.floor((axis.yMm - 1500) / MM_PER_SAMPLE);
    sy * MM_PER_SAMPLE < axis.yMm;
    sy++
  ) {
    for (
      let sx = Math.ceil((axis.xMm - 400) / MM_PER_SAMPLE);
      sx * MM_PER_SAMPLE <= axis.xMm + 400;
      sx++
    ) {
      if (densityAt(world, sx, sy) > 128 && touchesAir(world, sx, sy)) floor.push({ sx, sy })
    }
  }
  return floor
}

/** Whether the sample lies in the plain annulus of a ring round `axis`, its floor box aside. */
function isInAnnulusOf(axis: { xMm: number; yMm: number }, sx: number, sy: number): boolean {
  const dx = sx * MM_PER_SAMPLE - axis.xMm
  const dy = sy * MM_PER_SAMPLE - axis.yMm
  const outer = RING.clearMm + RING.widthMm
  return dx * dx + dy * dy < outer * outer
}

describe('casing lining', () => {
  it('starts from solid rock round the test point', () => {
    expect(samplesNearCentre().every(({ sx, sy }) => densityAt(EMPTY_WORLD, sx, sy) === 255)).toBe(
      true,
    )
  })

  it('lines every rock sample of the ring that touches air, at the grade, leaving its density', () => {
    const hole = boredHole()
    const lined = lineRing(hole, params, RING, 2)
    for (const { sx, sy } of samplesNearCentre()) {
      const shouldLine =
        isInRing(sx, sy) && densityAt(hole, sx, sy) > 128 && touchesAir(hole, sx, sy)
      expect(casingAt(lined.world, sx, sy)).toBe(shouldLine ? 2 : 0)
    }
    expect(keepsDensity(hole, lined.world)).toBe(true)
    expect(lined.placed).toBeGreaterThan(0)
    expect(lined.relined).toBe(0)
  })

  it('lines a level tunnel’s floor under the axis across the wheels’ width, above the annulus too (GD lock on #662, Q3)', () => {
    const tunnel = levelTunnel()
    const ring = casingRingAround(LEVEL_AXIS.xMm, LEVEL_AXIS.yMm)
    const lined = lineRing(tunnel, params, ring, 2).world
    const floor = floorSamplesUnder(tunnel, LEVEL_AXIS)
    expect(floor.length).toBeGreaterThan(0)
    expect(floor.some(({ sx, sy }) => !isInAnnulusOf(LEVEL_AXIS, sx, sy))).toBe(true)
    for (const { sx, sy } of floor) expect(casingAt(lined, sx, sy)).toBe(2)
  })

  it('spans from a quarter metre inside the stamp radius to a quarter metre past it', () => {
    expect(RING).toEqual({ ...CENTRE, clearMm: 350, widthMm: 500 })
  })

  it('lines the wall rock a ring off the cut’s axis finds inside the stamp radius (TD check on #662)', () => {
    // The bore centred at x = 640 mm leaves the sample at x = 1.25 m, 610 mm out, solid on its
    // wall; a trail axis 20 mm further on finds it 590 mm out, inside the 600 mm circle.
    const cut = { xMm: 640, yMm: CENTRE.yMm, radiusMm: drillStampRadiusMm(), floorRadiusMm: null }
    const hole = clearDisc(EMPTY_WORLD, params, { ...cut, edge: 'boreWall' }, 255).world
    const wall = { sx: 1250 / MM_PER_SAMPLE, sy: CENTRE.yMm / MM_PER_SAMPLE }
    expect(densityAt(hole, wall.sx, wall.sy)).toBeGreaterThan(128)
    expect(touchesAir(hole, wall.sx, wall.sy)).toBe(true)
    const lined = lineRing(hole, params, casingRingAround(cut.xMm + 20, cut.yMm), 2).world
    expect(casingAt(lined, wall.sx, wall.sy)).toBe(2)
  })

  it('never spreads into the rock: rings half a metre apart keep the lining one sample thick', () => {
    const tunnel = clearDisc(
      boredHole(),
      params,
      {
        xMm: CENTRE.xMm + 500,
        yMm: CENTRE.yMm,
        radiusMm: drillStampRadiusMm(),
        floorRadiusMm: null,
      },
      255,
    ).world
    const first = lineRing(tunnel, params, RING, 2).world
    const second = lineRing(first, params, casingRingAround(CENTRE.xMm + 500, CENTRE.yMm), 2)
    const lined = samplesNearCentre().filter(({ sx, sy }) => casingAt(second.world, sx, sy) > 0)
    expect(lined.length).toBeGreaterThan(0)
    expect(lined.every(({ sx, sy }) => touchesAir(second.world, sx, sy))).toBe(true)
  })

  it('counts a wall sample left at exactly the iso density as air, and lines the rock beside it', () => {
    const edge = { xMm: 0, yMm: 1120 * MM_PER_SAMPLE, radiusMm: 100, floorRadiusMm: null }
    const halfCut = clearDisc(EMPTY_WORLD, params, edge, 127).world
    expect(densityAt(halfCut, 0, 1120)).toBe(128)
    const ring = { xMm: 0, yMm: 1120 * MM_PER_SAMPLE, clearMm: 0, widthMm: 300 }
    const lined = lineRing(halfCut, params, ring, 1)
    expect(lined.placed).toBe(4)
    expect(casingAt(lined.world, 0, 1120)).toBe(0)
  })

  it('never narrows the bore: the contour is the same lined or not', () => {
    const hole = boredHole()
    const lined = lineRing(lineRing(hole, params, RING, 2).world, params, RING, 4)
    expect(keepsDensity(hole, lined.world)).toBe(true)
  })

  it('raises lower-grade lining to the new grade when a ring passes again', () => {
    const weak = lineRing(boredHole(), params, RING, 2)
    const relined = lineRing(weak.world, params, RING, 4)
    expect(relined.relined).toBe(weak.placed)
    const grades = samplesNearCentre().map(({ sx, sy }) => casingAt(relined.world, sx, sy))
    expect(grades.filter((grade) => grade > 0).every((grade) => grade === 4)).toBe(true)
  })

  it('reports the rock samples it newly lined, and none when a ring only relines', () => {
    const first = lineRing(boredHole(), params, RING, 2)
    expect(first.linedSamples).toHaveLength(first.placed)
    expect(first.linedSamples.every(({ sx, sy }) => casingAt(first.world, sx, sy) === 2)).toBe(true)
    const relined = lineRing(first.world, params, RING, 4)
    expect(relined.linedSamples).toEqual([])
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
  const LINING = { xMm: 0, yMm: 1120 * MM_PER_SAMPLE, clearMm: 0, widthMm: 1000 }

  it('yields a lined cell at the same eighth sample as an unlined one', () => {
    const drilled = clearSamples(EMPTY_WORLD, SEVEN)
    const lined = lineRing(drilled, params, LINING, 1)
    expect(lined.placed).toBeGreaterThan(0)
    expect(cellDensitySum(lined.world, params, TILE)).toBe(cellDensitySum(drilled, params, TILE))
    const unlinedEighth = clearDisc(drilled, params, sampleDisc(3, 1121), 255)
    const linedEighth = clearDisc(lined.world, params, sampleDisc(3, 1121), 255)
    expect(linedEighth.yielded).toEqual(unlinedEighth.yielded)
    expect(linedEighth.yielded.map(({ tile }) => tile)).toEqual([TILE])
  })

  it('never yields a cell for lining it', () => {
    const drilled = clearSamples(EMPTY_WORLD, SEVEN)
    expect(lineRing(drilled, params, LINING, 1).yielded).toEqual([])
    expect(isTileYielded(lineRing(drilled, params, LINING, 1).world, TILE)).toBe(false)
  })
})

describe('re-drilling casing', () => {
  /** Rock clears in 24 ticks; lining of any grade in 48, so the two can be told apart. */
  const SLOWER_CASING: CellDrillTicks = (_tile, _material, casingGrade) =>
    casingGrade > 0 ? 48 : 24
  const WIDE = { ...CENTRE, radiusMm: 2000, floorRadiusMm: null }

  it('drills lining in the drill time of its grade, then clears its casing at density 0', () => {
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

describe("casing lining: an opened cell's walls (ticket 377)", () => {
  it('names the 16 samples one step outside the four sides of the cell, none inside or at a corner', () => {
    const walls = cellWallSamplesOf({ tx: 2, ty: -3 })
    const inCell = (s: number, first: number) => s >= first && s < first + 4
    expect(walls).toHaveLength(16)
    expect(new Set(walls.map(({ sx, sy }) => `${sx},${sy}`)).size).toBe(16)
    for (const { sx, sy } of walls) {
      const isBesideSide =
        (inCell(sx, 8) && (sy === -13 || sy === -8)) || (inCell(sy, -12) && (sx === 7 || sx === 12))
      expect(isBesideSide).toBe(true)
    }
  })
})

describe('casing lining: a trail ring along its stretch of axis (the TD’s Q1 ruling on #662)', () => {
  /** A shaft's axis whose east wall rock lies 835 mm out, the sample column the scallop missed. */
  const SHAFT_X = 1250 - 835
  const RING_YS = [283_000, 283_500, 284_000, 284_500, 285_000]

  function boredShaft(): WorldState {
    let world = EMPTY_WORLD
    for (let y = 282_000; y <= 286_000; y += 50) {
      const disc = { xMm: SHAFT_X, yMm: y, radiusMm: drillStampRadiusMm(), floorRadiusMm: null }
      world = clearDisc(world, params, { ...disc, edge: 'boreWall' }, 255).world
    }
    return world
  }

  /** The shaft's wall rock between its first and last ring: solid, beside air, within the band. */
  function wallRockOf(world: WorldState): { sx: number; sy: number }[] {
    const wall = []
    for (
      let sy = RING_YS[0] / MM_PER_SAMPLE;
      sy <= RING_YS[RING_YS.length - 1] / MM_PER_SAMPLE;
      sy++
    ) {
      for (let sx = -2; sx <= 6; sx++) {
        const isRock = densityAt(world, sx, sy) > 128 && touchesAir(world, sx, sy)
        if (isRock) wall.push({ sx, sy })
      }
    }
    return wall
  }

  /** Rings at each point, each standing for the half metre above it, as a dig down lays them. */
  function linedDown(world: WorldState, ringAt: (y: number) => CasingRing): WorldState {
    return RING_YS.reduce((lined, y) => lineRing(lined, params, ringAt(y), 2).world, world)
  }

  it('lines all the wall rock between its points, which the circles round them leave', () => {
    const shaft = boredShaft()
    const wall = wallRockOf(shaft)
    const along = linedDown(shaft, (y) =>
      casingRingAlong(SHAFT_X, y, { xMm: SHAFT_X, yMm: y + CASING_RING_SPACING_MM }),
    )
    const circles = linedDown(shaft, (y) => casingRingAround(SHAFT_X, y))
    expect(wall).toHaveLength(2 * 9)
    expect(wall.filter(({ sx, sy }) => casingAt(along, sx, sy) === 0)).toEqual([])
    expect(wall.some(({ sx, sy }) => casingAt(circles, sx, sy) === 0)).toBe(true)
  })

  it('leaves the stretch before its own unlined, so the ring laid later there still lines new rock', () => {
    const shaft = boredShaft()
    const below = casingRingAlong(SHAFT_X, 284_000, { xMm: SHAFT_X, yMm: 284_500 })
    const above = casingRingAlong(SHAFT_X, 284_500, { xMm: SHAFT_X, yMm: 285_000 })
    const first = lineRing(shaft, params, below, 2)
    const second = lineRing(first.world, params, above, 2)
    expect(first.placed).toBeGreaterThan(0)
    expect(first.linedSamples.every(({ sy }) => sy * MM_PER_SAMPLE <= 284_500)).toBe(true)
    expect(second.placed).toBeGreaterThan(0)
  })

  it('is the circle when its stretch has no length', () => {
    const point = casingRingAlong(SHAFT_X, 284_000, { xMm: SHAFT_X, yMm: 284_000 })
    expect(ringSamplesOf(point)).toEqual(ringSamplesOf(casingRingAround(SHAFT_X, 284_000)))
  })
})
