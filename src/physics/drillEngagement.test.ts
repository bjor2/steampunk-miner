import { describe, expect, it } from 'vitest'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../constants/physics'
import {
  createAuthorityState,
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../systems/authority/authorityState'
import type { CutFollow } from '../systems/authority/cutFollowRead'
import { stepBoundsAt, stepReachMmOf } from '../systems/authority/stepBoundRead'
import { CLOSED_CUT_GATE, type CutGate } from '../systems/vehicle/cutGate'
import { createSeededRandom, type SeededRandom } from '../systems/seededRandom'
import { IDLE_INTENT } from '../systems/vehicle/vehicleIntent'
import type { CutFollowMotion } from '../systems/vehicle/cutFollowMotion'
import { FACING } from '../systems/vehicle/vehiclePose'
import { planetParamsFor } from '../systems/world/planetParams'
import { surfaceRowOfColumn } from '../systems/world/tileGrid'
import { isWaitingForCutAt, maxSpeedFor } from './drillEngagement'

// The client's clamp and the authority's bound are one function (TD scope a on #316, ticket 334):
// the speed the motor holds the body to, over one tick, is the step the authority accepts.

const SEED = 83921
const OPEN_GATE: CutGate = { cutGate: 1, cutGateLowTicks: 0 }

/** A rig on a random planet's surface, at a random depth, with random stored steps. */
function randomRig(random: SeededRandom): AuthorityState {
  const planetIndex = 1 + random.nextInt(40)
  const state = createAuthorityState({ planetIndex, planetSeed: SEED, playerIds: ['p1'] })
  const radius = planetParamsFor(SEED, planetIndex).radiusTiles
  const ty = surfaceRowOfColumn(0, radius) - random.nextInt(radius - 2)
  const vehicle = vehicleOf(state, 'p1')
  const levels = {
    ...vehicle.levels,
    drill_power: random.nextInt(4000),
    drill_tip: random.nextInt(1200),
    // Per purchase since ticket 553: Systems tested the engine to purchase 200.
    engine: random.nextInt(201),
  }
  const pose = { x: 500, y: ty * 1000 + 500, vx: 0, vy: 0, upx: 0, upy: 1024, facing: FACING.down }
  return withVehicle(state, 'p1', { ...vehicle, levels, pose })
}

/** The client's clamp, as mm the body may move in one tick. */
function clientStepMm(state: AuthorityState, gate: CutGate): number {
  const read: CutFollow = { gate, cutSpeed: 0 }
  const input = { intent: IDLE_INTENT, canAct: true, stepBounds: stepBoundsAt(state, 'p1') }
  return ((maxSpeedFor(input, read) as number) * MM_PER_METRE) / TICKS_PER_SECOND
}

describe('step bound parity (ticket 334)', () => {
  it('holds the body to the step the authority accepts, for 1,000 random stat sets', () => {
    const random = createSeededRandom(334)
    for (let set = 0; set < 1000; set++) {
      const state = randomRig(random)
      const bounds = stepBoundsAt(state, 'p1')
      for (const gate of [CLOSED_CUT_GATE, OPEN_GATE]) {
        expect(clientStepMm(state, gate)).toBeCloseTo(stepReachMmOf(bounds, gate, 1), 6)
      }
    }
  })

  it('leaves the 18 m/s clamp to the motion rule with the swept cut off', () => {
    expect(maxSpeedFor({ intent: IDLE_INTENT, canAct: true }, undefined)).toBeUndefined()
  })
})

describe('wait for the cut (ticket 400)', () => {
  const following: CutFollowMotion = {
    speed: 4,
    facing: FACING.left,
    isPushing: true,
    followedTicks: 6,
  }

  it('never holds the wheels for ground in the way while the drill sets the speed', () => {
    expect(isWaitingForCutAt(true, 'inTheWay', following)).toBe(false)
  })

  it('holds them on a span stop, a lead cell the drill may not cut', () => {
    expect(isWaitingForCutAt(true, 'ahead', { ...following, speed: 0 })).toBe(true)
  })

  it('holds them for ground in the way with no cut-follow, as before', () => {
    expect(isWaitingForCutAt(true, 'inTheWay', undefined)).toBe(true)
    expect(isWaitingForCutAt(true, 'ahead', undefined)).toBe(false)
  })

  it('never holds them outside a level cut', () => {
    expect(isWaitingForCutAt(false, 'inTheWay', undefined)).toBe(false)
    expect(isWaitingForCutAt(false, 'inTheWay', { ...following, speed: 0 })).toBe(false)
  })
})
