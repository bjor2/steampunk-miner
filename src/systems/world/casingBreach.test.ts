import { describe, expect, it } from 'vitest'
import { COLLAPSE_FILL_TICKS } from '../../constants/balance'
import { breachRing, hasIntactLining } from './casingBreach'
import { casingRingAround, lineRing, ringSamplesOf } from './casingLining'
import { CASING_BREACHED, isCasingValue } from './chunkDelta'
import { chunkStateDigest } from './chunkRepair'
import { blockContaining, samplesOfBlock } from './collapseBlock'
import { refillBlockStep } from './collapseRefill'
import { weaknessOfBlock } from './collapseWeakness'
import { clearDisc } from './groundEdit'
import { planetParamsFor } from './planetParams'
import { chunkOfSample, localSampleOf, MM_PER_SAMPLE, sampleIndexOf } from './sampleGrid'
import { currentCasingOfChunk, EMPTY_WORLD, type WorldState } from './worldState'

const params = planetParamsFor(83921, 1)
/** Cave-free band-1 rock 16 m down, as the weakness spec probes. */
const BAND_1_Y = 284500
const FROM_X = -30000
const TO_X = -14000
const MIDDLE_X = (FROM_X + TO_X) / 2
/** Band 5 is a ring round the core; a short tunnel 16.5 m from the centre stays inside it. */
const BAND_5 = { y: 16500, fromX: -6000, toX: 6000 }

function carveTunnel(world: WorldState, y: number, fromX = FROM_X, toX = TO_X): WorldState {
  let carved = world
  for (let x = fromX; x <= toX; x += MM_PER_SAMPLE) {
    carved = clearDisc(
      carved,
      params,
      { xMm: x, yMm: y, radiusMm: 950, floorRadiusMm: null },
      255,
    ).world
  }
  return carved
}

function lineTunnel(
  world: WorldState,
  y: number,
  grade: number,
  toX = TO_X,
  fromX = FROM_X,
): WorldState {
  let lined = world
  for (let x = fromX; x <= toX; x += 500) {
    lined = lineRing(lined, params, casingRingAround(x, y), grade).world
  }
  return lined
}

/** Every ring of the tunnel's middle 4 m gnawed, as a wrecker leaves a stretch. */
function gnawMiddle(world: WorldState, y: number, middleX = MIDDLE_X): WorldState {
  let gnawed = world
  for (let x = middleX - 2000; x <= middleX + 2000; x += 500) {
    gnawed = breachRing(gnawed, params, casingRingAround(x, y)).world
  }
  return gnawed
}

function casingAt(world: WorldState, sx: number, sy: number): number {
  const casing = currentCasingOfChunk(world, chunkOfSample(sx), chunkOfSample(sy))
  return casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))]
}

function ringCasing(world: WorldState, x: number, y: number): number[] {
  return ringSamplesOf(casingRingAround(x, y)).map(({ sx, sy }) => casingAt(world, sx, sy))
}

function digestAt(world: WorldState, x: number, y: number): string {
  const sx = Math.floor(x / MM_PER_SAMPLE)
  const sy = Math.floor(y / MM_PER_SAMPLE)
  return chunkStateDigest(world, params, { cx: chunkOfSample(sx), cy: chunkOfSample(sy) })
}

const middleBlock = (y: number) => blockContaining({ xMm: MIDDLE_X, yMm: y })

describe('breached casing', () => {
  it('breaches every lined sample of a gnawed ring, grade 1 to 15, and nothing else', () => {
    const lined = lineTunnel(carveTunnel(EMPTY_WORLD, BAND_1_Y), BAND_1_Y, 3)
    const before = ringCasing(lined, MIDDLE_X, BAND_1_Y)
    const gnaw = breachRing(lined, params, casingRingAround(MIDDLE_X, BAND_1_Y))
    const after = ringCasing(gnaw.world, MIDDLE_X, BAND_1_Y)
    expect(before.filter((casing) => casing === 3).length).toBeGreaterThan(5)
    expect(after).toEqual(before.map((casing) => (casing === 3 ? CASING_BREACHED : casing)))
    expect(gnaw.breachedSamples.length).toBe(before.filter((casing) => casing === 3).length)
    expect(gnaw.changes.length).toBeGreaterThan(0)
  })

  it('changes nothing when it gnaws never-lined rock or a ring already breached', () => {
    const unlined = carveTunnel(EMPTY_WORLD, BAND_1_Y)
    const ring = casingRingAround(MIDDLE_X, BAND_1_Y)
    const onRock = breachRing(unlined, params, ring)
    expect(onRock.breachedSamples).toEqual([])
    expect(onRock.changes).toEqual([])
    expect(digestAt(onRock.world, MIDDLE_X, BAND_1_Y)).toBe(digestAt(unlined, MIDDLE_X, BAND_1_Y))
    const once = breachRing(lineTunnel(unlined, BAND_1_Y, 1), params, ring).world
    const twice = breachRing(once, params, ring)
    expect(twice.breachedSamples).toEqual([])
    expect(digestAt(twice.world, MIDDLE_X, BAND_1_Y)).toBe(digestAt(once, MIDDLE_X, BAND_1_Y))
  })

  it('changes the chunk digest when a ring is breached, so host and guest can tell', () => {
    const lined = lineTunnel(carveTunnel(EMPTY_WORLD, BAND_1_Y), BAND_1_Y, 1)
    const gnawed = breachRing(lined, params, casingRingAround(MIDDLE_X, BAND_1_Y)).world
    expect(digestAt(gnawed, MIDDLE_X, BAND_1_Y)).not.toBe(digestAt(lined, MIDDLE_X, BAND_1_Y))
  })

  it('answers whether a ring still holds lining a gnaw would breach', () => {
    const ring = casingRingAround(MIDDLE_X, BAND_1_Y)
    const lined = lineTunnel(carveTunnel(EMPTY_WORLD, BAND_1_Y), BAND_1_Y, 1)
    expect(hasIntactLining(carveTunnel(EMPTY_WORLD, BAND_1_Y), ring)).toBe(false)
    expect(hasIntactLining(lined, ring)).toBe(true)
    expect(hasIntactLining(breachRing(lined, params, ring).world, ring)).toBe(false)
  })

  it('makes a band-1 block lined at grade 1 weak once a stretch is breached', () => {
    const lined = lineTunnel(carveTunnel(EMPTY_WORLD, BAND_1_Y), BAND_1_Y, 1)
    expect(weaknessOfBlock(lined, params, middleBlock(BAND_1_Y))).toBeNull()
    expect(weaknessOfBlock(gnawMiddle(lined, BAND_1_Y), params, middleBlock(BAND_1_Y))).toEqual({
      band: 1,
      weakestGrade: 0,
      required: 1,
    })
  })

  it('makes a band-5 block lined at grade 5 weak once a stretch is breached', () => {
    const { y, fromX, toX } = BAND_5
    const lined = lineTunnel(carveTunnel(EMPTY_WORLD, y, fromX, toX), y, 5, toX, fromX)
    const block = blockContaining({ xMm: 0, yMm: y })
    expect(weaknessOfBlock(lined, params, block)).toBeNull()
    expect(weaknessOfBlock(gnawMiddle(lined, y, 0), params, block)).toEqual({
      band: 5,
      weakestGrade: 0,
      required: 5,
    })
  })

  it('still ignores never-lined rock beside a breached ring', () => {
    const halfLined = lineTunnel(carveTunnel(EMPTY_WORLD, BAND_1_Y), BAND_1_Y, 1, MIDDLE_X - 6000)
    let gnawed = halfLined
    for (let x = FROM_X; x <= MIDDLE_X - 6000; x += 500) {
      gnawed = breachRing(gnawed, params, casingRingAround(x, BAND_1_Y)).world
    }
    expect(
      weaknessOfBlock(gnawed, params, blockContaining({ xMm: FROM_X, yMm: BAND_1_Y })),
    ).not.toBeNull()
    expect(
      weaknessOfBlock(gnawed, params, blockContaining({ xMm: TO_X, yMm: BAND_1_Y })),
    ).toBeNull()
  })

  it('relines a breached ring at the vehicle grade as relining, never as new lining', () => {
    const gnawed = gnawMiddle(lineTunnel(carveTunnel(EMPTY_WORLD, BAND_1_Y), BAND_1_Y, 1), BAND_1_Y)
    const reline = lineRing(gnawed, params, casingRingAround(MIDDLE_X, BAND_1_Y), 1)
    expect(reline.placed).toBe(0)
    expect(reline.linedSamples).toEqual([])
    expect(reline.relined).toBeGreaterThan(5)
    expect(ringCasing(reline.world, MIDDLE_X, BAND_1_Y)).not.toContain(CASING_BREACHED)
  })

  it('keeps the lining type of a breached ring: free to reline in it, charged in another (#113)', () => {
    const ring = casingRingAround(MIDDLE_X, BAND_1_Y)
    const tunnel = carveTunnel(EMPTY_WORLD, BAND_1_Y)
    const refractory = breachRing(lineRing(tunnel, params, ring, 2, 1).world, params, ring).world
    const sameType = lineRing(refractory, params, ring, 2, 1)
    expect([sameType.placed, sameType.relined > 0]).toEqual([0, true])
    const standard = breachRing(lineRing(tunnel, params, ring, 2).world, params, ring).world
    expect(lineRing(standard, params, ring, 2, 1).placed).toBeGreaterThan(0)
  })

  it('stops a breached block being weak once the stretch is relined', () => {
    const gnawed = gnawMiddle(lineTunnel(carveTunnel(EMPTY_WORLD, BAND_1_Y), BAND_1_Y, 1), BAND_1_Y)
    const relined = lineTunnel(gnawed, BAND_1_Y, 1)
    expect(weaknessOfBlock(relined, params, middleBlock(BAND_1_Y))).toBeNull()
  })

  it('leaves 0 where the drill carves a breached sample', () => {
    const gnawed = gnawMiddle(lineTunnel(carveTunnel(EMPTY_WORLD, BAND_1_Y), BAND_1_Y, 1), BAND_1_Y)
    const disc = { xMm: MIDDLE_X, yMm: BAND_1_Y, radiusMm: 1750, floorRadiusMm: null }
    const widened = clearDisc(gnawed, params, disc, 255).world
    const ring = ringSamplesOf(casingRingAround(MIDDLE_X, BAND_1_Y))
    expect(ring.map(({ sx, sy }) => casingAt(gnawed, sx, sy))).toContain(CASING_BREACHED)
    expect(
      ring.map(({ sx, sy }) => casingAt(widened, sx, sy)).every((casing) => casing === 0),
    ).toBe(true)
  })

  it('leaves 0 in every sample a collapse refill touched', () => {
    const block = middleBlock(BAND_1_Y)
    let world = gnawMiddle(lineTunnel(carveTunnel(EMPTY_WORLD, BAND_1_Y), BAND_1_Y, 1), BAND_1_Y)
    expect(
      samplesOfBlock(block).some(({ sx, sy }) => casingAt(world, sx, sy) === CASING_BREACHED),
    ).toBe(true)
    for (let step = 0; step < COLLAPSE_FILL_TICKS; step++) {
      world = refillBlockStep(world, params, block, step, []).world
    }
    expect(samplesOfBlock(block).every(({ sx, sy }) => casingAt(world, sx, sy) === 0)).toBe(true)
  })

  it('holds only none, a grade of 1 to 15 of a lining type, or breached in the casing layer', () => {
    expect([0, 1, 15, CASING_BREACHED, 16, 17, 31].every(isCasingValue)).toBe(true)
    expect([240, 247, 254].some(isCasingValue)).toBe(false)
  })
})
