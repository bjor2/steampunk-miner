import { describe, expect, it } from 'vitest'
import { COLLAPSE_FILL_TICKS } from '../../constants/balance'
import { casingRingAround, lineRing } from './casingLining'
import { blockContaining, samplesOfBlock, type CollapseBlock } from './collapseBlock'
import { planRefill, refillBlockStep, type BodyCentre } from './collapseRefill'
import { weaknessOfBlock } from './collapseWeakness'
import { clearDisc } from './groundEdit'
import { planetParamsFor } from './planetParams'
import { chunkOfSample, localSampleOf, MM_PER_SAMPLE, sampleIndexOf } from './sampleGrid'
import { isCarvedAirAt, openSampleLayers } from './sampleLayers'
import { cellIndexOfTile, chunkOfTile } from './tileGrid'
import { currentCasingOfChunk, deltaOfChunk, EMPTY_WORLD, type WorldState } from './worldState'
import { isCellYielded } from './chunkDelta'

const params = planetParamsFor(83921, 1)
/** Cave-free band-2 rock 48 m down, as in the weakness spec. */
const Y = 252500
const FROM_X = -30000
const TO_X = -14000
const BLOCK = blockContaining({ xMm: -22000, yMm: Y })

/** A band-2 tunnel lined at grade 1: weak. */
function weakTunnel(): WorldState {
  let world = EMPTY_WORLD
  for (let x = FROM_X; x <= TO_X; x += MM_PER_SAMPLE) {
    world = clearDisc(
      world,
      params,
      { xMm: x, yMm: Y, radiusMm: 950, floorRadiusMm: null },
      255,
    ).world
  }
  for (let x = FROM_X; x <= TO_X; x += 500) {
    world = lineRing(world, params, casingRingAround(x, Y), 1).world
  }
  return world
}

function carvedAirIn(world: WorldState, block: CollapseBlock) {
  const layers = openSampleLayers(world, params)
  return samplesOfBlock(block).filter(({ sx, sy }) => isCarvedAirAt(layers, sx, sy))
}

function liningIn(world: WorldState, block: CollapseBlock): number {
  return samplesOfBlock(block).filter(({ sx, sy }) => {
    const casing = currentCasingOfChunk(world, chunkOfSample(sx), chunkOfSample(sy))
    return casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))] > 0
  }).length
}

/** Every refill step in turn; answers the world after each. */
function refillAll(world: WorldState, bodies: readonly BodyCentre[] = []): WorldState[] {
  const after: WorldState[] = []
  let current = world
  for (let step = 0; step < COLLAPSE_FILL_TICKS; step++) {
    current = refillBlockStep(current, params, BLOCK, step, bodies).world
    after.push(current)
  }
  return after
}

describe('collapse refill', () => {
  it('fills every carved-air sample of the block by the last step', () => {
    const world = weakTunnel()
    expect(carvedAirIn(world, BLOCK).length).toBeGreaterThan(50)
    const steps = refillAll(world)
    expect(carvedAirIn(steps[COLLAPSE_FILL_TICKS - 1], BLOCK)).toEqual([])
  })

  it('fills from the walls inward, one outer layer at a time', () => {
    const world = weakTunnel()
    const first = refillBlockStep(world, params, BLOCK, 0, [])
    const left = carvedAirIn(first.world, BLOCK).length
    expect(first.filled).toBeGreaterThan(0)
    expect(left).toBeGreaterThan(first.filled)
    const remaining = refillAll(world).map((after) => carvedAirIn(after, BLOCK).length)
    expect(remaining).toEqual([...remaining].sort((a, b) => b - a))
  })

  it('destroys the lining so the refilled block is never weak again', () => {
    const world = weakTunnel()
    expect(liningIn(world, BLOCK)).toBeGreaterThan(0)
    const first = refillBlockStep(world, params, BLOCK, 0, []).world
    expect(liningIn(first, BLOCK)).toBe(0)
    expect(weaknessOfBlock(first, params, BLOCK)).toBeNull()
  })

  it('keeps yielded cells yielded, so re-digging pays no ore twice', () => {
    const world = weakTunnel()
    const [{ sx, sy }] = carvedAirIn(world, BLOCK)
    const tile = { tx: Math.floor(sx / 4), ty: Math.floor(sy / 4) }
    const isYielded = (at: WorldState) =>
      isCellYielded(
        deltaOfChunk(at, chunkOfTile(tile.tx), chunkOfTile(tile.ty)),
        cellIndexOfTile(tile.tx, tile.ty),
      )
    expect(isYielded(world)).toBe(true)
    expect(isYielded(refillAll(world)[COLLAPSE_FILL_TICKS - 1])).toBe(true)
  })

  it('leaves a pocket round a vehicle in the block and never fills inside it', () => {
    const world = weakTunnel()
    const body = { xMm: -22000, yMm: Y }
    const plan = planRefill(world, params, BLOCK, [body, { xMm: 0, yMm: Y }])
    expect(plan.caught).toEqual([true, false])
    const last = refillAll(world, [body])[COLLAPSE_FILL_TICKS - 1]
    const pocket = carvedAirIn(last, BLOCK)
    expect(pocket.length).toBeGreaterThan(0)
    expect(plan.samples).toBe(carvedAirIn(world, BLOCK).length - pocket.length)
    const reach = (887 + MM_PER_SAMPLE) * (887 + MM_PER_SAMPLE)
    expect(
      pocket.every(({ sx, sy }) => {
        const dx = sx * MM_PER_SAMPLE - body.xMm
        const dy = sy * MM_PER_SAMPLE - body.yMm
        return dx * dx + dy * dy <= reach
      }),
    ).toBe(true)
  })
})
