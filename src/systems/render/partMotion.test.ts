import { describe, expect, it } from 'vitest'
import { DRILL_RADIANS_PER_TICK, LANDING_SQUASH_SHARE } from '../../constants/scene'
import {
  createPartMotion,
  createPartPose,
  recoilFromHit,
  stepPartMotion,
  writePartPose,
  type PartMotion,
  type PartMotionStep,
  type PartPose,
} from './partMotion'

const IDLE: PartMotionStep = {
  alongMetresPerSecond: 0,
  upMetresPerSecond: 0,
  isDriving: false,
  isThrusting: false,
  isDrilling: false,
}
const WHEEL_RADIUS = 0.12
/** Every placeholder part slot of the three tiers. */
const SLOTS = [
  'chassis',
  'wheel',
  'wheel-2',
  'drill-head',
  'drill-bit',
  'boiler',
  'boiler-2',
  'stack',
  'stack-2',
  'piston',
  'hopper',
  'motor-housing',
  'armour-plate',
  'headlamp',
  'headlamp-2',
]

function run(motion: PartMotion, step: PartMotionStep, seconds: number, ticksPerSecond = 60) {
  for (let tick = 0; tick < Math.round(seconds * ticksPerSecond); tick++) {
    stepPartMotion(motion, step, 1 / ticksPerSecond)
  }
}

function poseOf(motion: PartMotion, slot: string, isMotionReduced = false): PartPose {
  const pose = createPartPose()
  writePartPose(motion, slot, WHEEL_RADIUS, isMotionReduced, pose)
  return { ...pose }
}

describe('part motion', () => {
  it('keeps every part still on an idle vehicle over 5 s, but the boiler breath and the lamp flicker (#48 acceptance 1)', () => {
    const motion = createPartMotion()
    run(motion, IDLE, 1)
    const before = SLOTS.map((slot) => poseOf(motion, slot))
    run(motion, IDLE, 5)
    const after = SLOTS.map((slot) => poseOf(motion, slot))
    const moved = SLOTS.filter((_, at) => JSON.stringify(before[at]) !== JSON.stringify(after[at]))
    expect(moved.filter((slot) => !/^(boiler|headlamp)/.test(slot))).toEqual([])
  })

  it.each([30, 60, 144])(
    'turns the wheels at ground speed over their radius at %i ticks a second (#48 acceptance 2)',
    (ticksPerSecond) => {
      const motion = createPartMotion()
      run(motion, { ...IDLE, alongMetresPerSecond: 3, isDriving: true }, 2, ticksPerSecond)
      const spin = -poseOf(motion, 'wheel-2').angle / 2
      expect(spin).toBeGreaterThan((3 / WHEEL_RADIUS) * 0.95)
      expect(spin).toBeLessThan((3 / WHEEL_RADIUS) * 1.05)
    },
  )

  it('rolls the wheels back when the vehicle backs up', () => {
    const motion = createPartMotion()
    run(motion, { ...IDLE, alongMetresPerSecond: -2, isDriving: true }, 1)
    expect(poseOf(motion, 'wheel').angle).toBeGreaterThan(0)
  })

  it('turns the drill bit by a fixed angle per drilling tick and not otherwise (#48 acceptance 2)', () => {
    const motion = createPartMotion()
    run(motion, { ...IDLE, isDrilling: true }, 1)
    run(motion, IDLE, 1)
    expect(motion.drillTicks).toBe(60)
    expect(poseOf(motion, 'drill-bit').angle).toBeCloseTo(-60 * DRILL_RADIANS_PER_TICK, 9)
  })

  it('lights the drill tip while it bites and lets it fade after', () => {
    const motion = createPartMotion()
    run(motion, { ...IDLE, isDrilling: true }, 0.5)
    expect(poseOf(motion, 'drill-bit').glow).toBeGreaterThan(0.95)
    run(motion, IDLE, 1)
    expect(poseOf(motion, 'drill-bit').glow).toBeLessThan(0.01)
  })

  it('pumps the pistons only under thrust', () => {
    const motion = createPartMotion()
    run(motion, { ...IDLE, isThrusting: true }, 0.1)
    const lifted = poseOf(motion, 'piston').y
    run(motion, IDLE, 1)
    expect(lifted).not.toBe(0)
    expect(poseOf(motion, 'piston').y).toBe(lifted)
  })

  it('squashes the chassis 3% on landing, then settles', () => {
    const motion = createPartMotion()
    run(motion, { ...IDLE, upMetresPerSecond: -6 }, 0.5)
    stepPartMotion(motion, IDLE, 0)
    expect(poseOf(motion, 'chassis').scaleY).toBeCloseTo(1 - LANDING_SQUASH_SHARE, 9)
    run(motion, IDLE, 0.5)
    expect(poseOf(motion, 'chassis').scaleY).toBe(1)
  })

  it('recoils on a hit and comes back to rest', () => {
    const motion = createPartMotion()
    recoilFromHit(motion)
    run(motion, IDLE, 0.06)
    expect(poseOf(motion, 'chassis').x).toBeLessThan(0)
    run(motion, IDLE, 0.5)
    expect(poseOf(motion, 'chassis').x).toBe(0)
  })

  it('keeps the squash and the recoil still with motion effects off (#48 acceptance 6)', () => {
    const motion = createPartMotion()
    recoilFromHit(motion)
    run(motion, { ...IDLE, upMetresPerSecond: -6 }, 0.03)
    stepPartMotion(motion, IDLE, 0)
    expect(poseOf(motion, 'chassis', true)).toMatchObject({ x: 0, scaleY: 1 })
  })
})
