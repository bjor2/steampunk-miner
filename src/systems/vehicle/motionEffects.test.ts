import { describe, expect, it } from 'vitest'
import { PHYSICS_TIMESTEP } from '../../constants/physics'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { createAuthorityState } from '../authority/authorityState'
import { ECONOMY } from '../economy/economy'
import { engineStats } from '../economy/vehicleStats'
import { vehicleMotionAt } from '../registries/vehicleMotionEffects'
import { dot, type Vector2 } from './localFrame'
import { foldMotionEffects, PLAIN_MOTION, type VehicleMotionEffect } from './motionEffects'
import { IDLE_INTENT, type VehicleIntent } from './vehicleIntent'
import { stepVehicleMotion, type MotionStep, type MotionStepInput } from './vehicleMotion'

// Slice motion effects (ticket 233, the GD lock on #204 Q1 a): boosts sum to at most +2000 bp
// over the engine track, and with no effect the step is the plain one.

const CAP_BP = ECONOMY.itemEffectCaps.motionBoostCapBp
const ENGINE = engineStats(0)
const UP: Vector2 = { x: 0, y: 1 }
const GRAVITY: Vector2 = { x: 0, y: -9.81 }
const LIFT: VehicleIntent = { ...IDLE_INTENT, lift: true }
const RIGHT: VehicleIntent = { ...IDLE_INTENT, moveX: 1 }

const fold = (effects: readonly VehicleMotionEffect[], tick = 0) =>
  foldMotionEffects(effects, tick, CAP_BP)

interface RunOptions {
  intent?: VehicleIntent
  effects?: readonly VehicleMotionEffect[] | null
  canAct?: boolean
  isTouchingSurface?: boolean
  position?: Vector2
  gravity?: Vector2
}

/** The motion rule for `steps` fixed steps from rest, the effects folded at tick 0. */
function run(steps: number, options: RunOptions = {}): MotionStep {
  const { intent = IDLE_INTENT, effects = null, canAct = true, gravity = GRAVITY } = options
  let step: MotionStep = { velocity: { x: 0, y: 0 }, isDriving: false, isThrusting: false }
  for (let index = 0; index < steps; index++) {
    const input: MotionStepInput = {
      velocity: step.velocity,
      up: UP,
      gravity,
      intent,
      engine: ENGINE,
      canAct,
      isGrounded: false,
      boreOffset: null,
      isCuttingLevel: false,
      isWaitingForCut: false,
      dt: PHYSICS_TIMESTEP,
    }
    step = stepVehicleMotion(effects === null ? input : { ...input, effect: effectOf(options) })
  }
  return step
}

function effectOf({
  effects = [],
  isTouchingSurface = false,
  position = { x: 0, y: 0 },
}: RunOptions) {
  return { motion: fold(effects ?? []), position, isTouchingSurface }
}

const speedOf = (velocity: Vector2) => Math.sqrt(dot(velocity, velocity))

describe('motion effects: the fold', () => {
  it('is the plain motion with no effect', () => {
    expect(fold([])).toBe(PLAIN_MOTION)
  })

  it('adds lift and drive boosts and caps each at +2000 bp over the engine track', () => {
    expect(fold([{ liftBp: 800 }, { liftBp: 700, driveBp: 500 }])).toMatchObject({
      liftBoostBp: 1500,
      driveBoostBp: 500,
    })
    expect(fold([{ liftBp: 1500 }, { liftBp: 1500, driveBp: 6667 }])).toMatchObject({
      liftBoostBp: 2000,
      driveBoostBp: 2000,
    })
  })

  it('drops a burst once its window has ended', () => {
    const burst = { dirX: 1, dirY: 0, speedMmPerS: 4000, untilTick: 30 }
    expect(fold([{ burst }], 29).burst).toEqual({ x: 4, y: 0 })
    expect(fold([{ burst }], 30).burst).toBeNull()
  })

  it('reels toward the centre of the first reel tile in id order', () => {
    expect(fold([{ reelTo: { tx: 3, ty: 7 } }, { reelTo: { tx: 9, ty: 9 } }]).reelTo).toEqual({
      x: 3.5,
      y: 7.5,
    })
  })

  it('folds every registered source on the player at the tick, under the cap', () => {
    const boosting = (id: string): SliceDefinition => ({
      id,
      register: (r) =>
        r.vehicleMotionEffect({ id: `${id}.boost`, effectOf: () => ({ liftBp: 1500 }) }),
    })
    const state = createAuthorityState({ planetIndex: 1, planetSeed: 1, playerIds: ['p1'] })
    expect(withRegistrations([], () => vehicleMotionAt(state, 'p1', 0))).toBe(PLAIN_MOTION)
    const both = withRegistrations([boosting('boost-a'), boosting('boost-b')], () =>
      vehicleMotionAt(state, 'p1', 0),
    )
    expect(both.liftBoostBp).toBe(2000)
  })
})

describe('motion effects: the step', () => {
  it('drives exactly as before under an effect with nothing in it', () => {
    expect(run(30, { intent: LIFT, effects: [{}] })).toEqual(run(30, { intent: LIFT }))
    expect(run(30, { intent: RIGHT, effects: [{}] })).toEqual(run(30, { intent: RIGHT }))
  })

  it('lifts harder with a lift boost, but no harder than the +2000 bp cap', () => {
    const plain = run(1, { intent: LIFT }).velocity.y
    const capped = run(1, { intent: LIFT, effects: [{ liftBp: 2000 }] }).velocity.y
    expect(capped).toBeGreaterThan(plain)
    expect(run(1, { intent: LIFT, effects: [{ liftBp: 9000 }] }).velocity.y).toBe(capped)
  })

  it('drives faster with a drive boost, at most 1.2 times the engine top speed', () => {
    const level = { intent: RIGHT, gravity: { x: 0, y: 0 } }
    const boosted = run(240, { ...level, effects: [{ driveBp: 9000 }] }).velocity.x
    expect(run(240, level).velocity.x).toBeCloseTo(ENGINE.speedMax, 9)
    expect(boosted).toBeCloseTo(ENGINE.speedMax * 1.2, 9)
  })

  it('bursts along its direction, never faster than the top speed plus the cap', () => {
    const burst = { dirX: 0, dirY: 1, speedMmPerS: 100_000, untilTick: 30 }
    const step = run(1, { effects: [{ burst }] })
    expect(step.velocity.x).toBe(0)
    expect(step.velocity.y).toBeCloseTo(ENGINE.speedMax * 1.2, 9)
    expect(step.isThrusting).toBe(false)
  })

  it('reels to its tile and arrives on the step that reaches it', () => {
    const reel = { reelTo: { tx: 0, ty: 0 } }
    const far = run(1, { effects: [reel], position: { x: -9.5, y: 0.5 } }).velocity
    expect(far).toEqual({ x: ENGINE.speedMax, y: 0 })
    const near = run(1, { effects: [reel], position: { x: 0.45, y: 0.5 } }).velocity
    expect(near.x).toBeCloseTo(0.05 / PHYSICS_TIMESTEP, 9)
  })

  it('hovers in open air without thrust, where the plain vehicle falls', () => {
    expect(run(60).velocity.y).toBeLessThan(-1)
    expect(speedOf(run(60, { effects: [{ hover: true }] }).velocity)).toBe(0)
  })

  it('clings only while a side touches ground', () => {
    const cling = [{ cling: true }]
    expect(speedOf(run(60, { effects: cling, isTouchingSurface: true }).velocity)).toBe(0)
    expect(run(60, { effects: cling, isTouchingSurface: false })).toEqual(run(60))
  })

  it('does nothing for a vehicle that cannot act, as an empty tank strands it', () => {
    const burst = { dirX: 1, dirY: 0, speedMmPerS: 4000, untilTick: 30 }
    expect(run(60, { canAct: false, effects: [{ hover: true }, { burst }] })).toEqual(
      run(60, { canAct: false }),
    )
  })
})
