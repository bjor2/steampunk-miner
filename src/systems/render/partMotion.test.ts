import { describe, expect, it } from 'vitest'
import {
  CASING_ARM_SECONDS,
  CASING_ARM_SWING_RADIANS,
  DRILL_RADIANS_PER_TICK,
  DRILL_SPARK_LIGHT,
  LANDING_SQUASH_SHARE,
  THRUSTER_GLOW_COLOUR,
} from '../../constants/scene'
import {
  createPartMotion,
  createPartPose,
  glowColourOf,
  layCasingRing,
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
  'thruster',
  'thruster-2',
  'casing-arm',
  'casing-arm-2',
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

  it('lights the drill nose with the bit while it bites (ticket 393: the glowing nose)', () => {
    const motion = createPartMotion()
    run(motion, { ...IDLE, isDrilling: true }, 0.5)
    expect(poseOf(motion, 'drill-head').glow).toBeGreaterThan(0.95)
    run(motion, IDLE, 1)
    expect(poseOf(motion, 'drill-head').glow).toBeLessThan(0.01)
  })

  it('lights the thrusters only while they fire, and lets them fade after (ticket 393)', () => {
    const motion = createPartMotion()
    run(motion, { ...IDLE, alongMetresPerSecond: 2, isDriving: true, isDrilling: true }, 0.5)
    expect(poseOf(motion, 'thruster').glow).toBe(0)
    run(motion, { ...IDLE, isThrusting: true }, 0.5)
    expect(poseOf(motion, 'thruster-2').glow).toBeGreaterThan(0.95)
    run(motion, IDLE, 1)
    expect(poseOf(motion, 'thruster').glow).toBeLessThan(0.01)
  })

  it.each([30, 144])(
    'swings the casing arms out once as a ring is laid, and home after the swing, at %i ticks a second',
    (ticksPerSecond) => {
      const motion = createPartMotion()
      layCasingRing(motion)
      run(motion, IDLE, CASING_ARM_SECONDS / 2, ticksPerSecond)
      expect(poseOf(motion, 'casing-arm').angle).toBeGreaterThan(CASING_ARM_SWING_RADIANS * 0.95)
      expect(poseOf(motion, 'casing-arm-2').angle).toBe(poseOf(motion, 'casing-arm').angle)
      run(motion, IDLE, CASING_ARM_SECONDS / 2 + 0.05, ticksPerSecond)
      expect(poseOf(motion, 'casing-arm').angle).toBe(0)
    },
  )

  it('glows the nose in its sparks’ colour, the thrusters in their exhaust’s and the lamps in their own', () => {
    expect(glowColourOf('drill-bit', '#5b3a1e')).toBe(DRILL_SPARK_LIGHT.colour)
    expect(glowColourOf('drill-head', '#5b3a1e')).toBe(DRILL_SPARK_LIGHT.colour)
    expect(glowColourOf('thruster-2', '#c9a24b')).toBe(THRUSTER_GLOW_COLOUR)
    expect(glowColourOf('headlamp', '#ffd9a0')).toBe('#ffd9a0')
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
