import { describe, expect, it } from 'vitest'
import { ECONOMY } from '../economy/economy'
import { engineStats } from '../economy/vehicleStats'
import { dot, type Vector2 } from './localFrame'
import { foldMotionEffects, isInputLocked, type VehicleMotionEffect } from './motionEffects'
import type { MotionGlide } from './motionGlide'
import { FACING } from './vehiclePose'
import { IDLE_INTENT, type VehicleIntent } from './vehicleIntent'
import { stepVehicleMotion, type MotionStep } from './vehicleMotion'

// The glide (ticket 390, for the phase move of #261 and G&V's rules on it): a straight line at one
// constant speed to a tile's centre, at rest there on its last step, input locked and gravity
// paused, the speed derived from the distance and the ticks the authority gives it.

const CAP_BP = ECONOMY.itemEffectCaps.motionBoostCapBp
const ENGINE = engineStats(0)
const UP: Vector2 = { x: 0, y: 1 }
const GRAVITY: Vector2 = { x: 0, y: -9.81 }
const HELD: VehicleIntent = { moveX: 1, facing: FACING.down, lift: true }
const START: Vector2 = { x: 3.5, y: 9.5 }
/** Two tiles down from `START`'s tile, through the one between. */
const GLIDE: MotionGlide = { to: { tx: 3, ty: 7 }, untilTick: 24, passThrough: { tx: 3, ty: 8 } }
const LANDING_CENTRE: Vector2 = { x: 3.5, y: 7.5 }

interface GlideRun {
  /** Where the body stood before each step and after the last. */
  positions: Vector2[]
  steps: MotionStep[]
}

interface GlideOptions {
  dt: number
  effects?: readonly VehicleMotionEffect[]
  canAct?: boolean
  intent?: VehicleIntent
  /** A push added to the body's position after the step at this tick, as a contact would. */
  nudge?: { tick: number; by: Vector2 }
}

/** Every fixed step from tick 0 until the glide ends, the body moved by each step's velocity. */
function glide(options: GlideOptions): GlideRun {
  const { dt, effects = [{ glide: GLIDE }], canAct = true, intent = HELD, nudge } = options
  const positions = [START]
  const steps: MotionStep[] = []
  let velocity: Vector2 = { x: 0, y: 0 }
  for (let tick = 0; tick < GLIDE.untilTick; tick++) {
    const position = positions[positions.length - 1]
    const motion = foldMotionEffects(effects, tick, CAP_BP)
    const step = stepVehicleMotion({
      velocity,
      up: UP,
      gravity: GRAVITY,
      intent,
      engine: ENGINE,
      canAct,
      isGrounded: false,
      boreOffset: null,
      isCuttingLevel: false,
      isWaitingForCut: false,
      dt,
      effect: { motion, position, isTouchingSurface: false },
    })
    const push = nudge?.tick === tick ? nudge.by : { x: 0, y: 0 }
    positions.push({
      x: position.x + step.velocity.x * dt + push.x,
      y: position.y + step.velocity.y * dt + push.y,
    })
    steps.push(step)
    velocity = step.velocity
  }
  return { positions, steps }
}

const speedOf = (velocity: Vector2) => Math.sqrt(dot(velocity, velocity))

function expectAt(position: Vector2, expected: Vector2): void {
  expect(position.x).toBeCloseTo(expected.x, 9)
  expect(position.y).toBeCloseTo(expected.y, 9)
}

describe('motion glide', () => {
  it.each([30, 144])(
    'keeps one speed and rests at the landing centre on its last step, at %i steps/s',
    (stepsPerSecond) => {
      const dt = 1 / stepsPerSecond
      const { positions, steps } = glide({ dt })
      const moving = steps.slice(0, -1).map((step) => speedOf(step.velocity))
      const distance = START.y - LANDING_CENTRE.y
      for (const speed of moving) {
        expect(speed).toBeCloseTo(distance / ((GLIDE.untilTick - 1) * dt), 9)
      }
      expect(speedOf(steps[steps.length - 1].velocity)).toBeCloseTo(0, 9)
      expectAt(positions[positions.length - 2], LANDING_CENTRE)
      expectAt(positions[positions.length - 1], LANDING_CENTRE)
    },
  )

  it('runs along the straight line between the start and the landing centre', () => {
    const { positions } = glide({ dt: 1 / 60 })
    for (const position of positions) expect(position.x).toBeCloseTo(START.x, 9)
  })

  it('locks the input and pauses gravity: held wheels, lift and drill change nothing', () => {
    const held = glide({ dt: 1 / 60 })
    const idle = glide({ dt: 1 / 60, intent: IDLE_INTENT })
    expect(held).toEqual(idle)
    expect(held.steps.every((step) => !step.isDriving && !step.isThrusting)).toBe(true)
    expect(isInputLocked(foldMotionEffects([{ glide: GLIDE }], 0, CAP_BP))).toBe(true)
  })

  it('finds its line again after a nudge and still rests at the landing centre on time', () => {
    const { positions } = glide({ dt: 1 / 60, nudge: { tick: 8, by: { x: 0.04, y: 0.03 } } })
    expectAt(positions[positions.length - 1], LANDING_CENTRE)
  })

  it('runs on a vehicle that cannot act: stopping halfway would leave it in the ground', () => {
    const stranded = glide({ dt: 1 / 60, canAct: false })
    expectAt(stranded.positions[stranded.positions.length - 1], LANDING_CENTRE)
  })

  it('outranks a burst and a reel, and the first glide running in id order wins', () => {
    const burst = { dirX: 1, dirY: 0, speedMmPerS: 4000, untilTick: 30 }
    const other: MotionGlide = { ...GLIDE, to: { tx: 9, ty: 9 } }
    const effects = [{ burst }, { reelTo: { tx: 0, ty: 0 } }, { glide: GLIDE }, { glide: other }]
    const { positions } = glide({ dt: 1 / 60, effects })
    expectAt(positions[positions.length - 1], LANDING_CENTRE)
  })

  it('names the passed-through cell while it runs and nothing once it has ended', () => {
    const running = foldMotionEffects([{ glide: GLIDE }], GLIDE.untilTick - 1, CAP_BP)
    expect(running.glide).toEqual({
      to: LANDING_CENTRE,
      stepsLeft: 1,
      passThrough: { tx: 3, ty: 8 },
    })
    const ended = foldMotionEffects([{ glide: GLIDE }], GLIDE.untilTick, CAP_BP)
    expect(ended.glide).toBeNull()
    expect(isInputLocked(ended)).toBe(false)
  })
})
