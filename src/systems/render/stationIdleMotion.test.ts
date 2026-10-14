import { describe, expect, it } from 'vitest'
import {
  STATION_ARC_GLOW,
  STATION_CONVEYOR_MPS,
  STATION_CONVEYOR_PITCH_M,
  STATION_CONVEYOR_RISE_M,
  STATION_CONVEYOR_RUN_M,
  STATION_GLOW_COLOUR,
  STATION_WELD_BURN_SECONDS,
  STATION_WELD_CYCLE_SECONDS,
  STATION_WELD_GLOW,
} from '../../constants/scene'
import { shopBuildingMovingPartIdsOf } from '../art/shopBuildingArt'
import {
  createPartMotion,
  createPartPose,
  glowColourOf,
  stepPartMotion,
  writePartPose,
  type PartMotionStep,
  type PartPose,
} from './partMotion'
import { isStationIdlePart, writeStationIdlePose } from './stationIdleMotion'

const IDLE: PartMotionStep = {
  alongMetresPerSecond: 0,
  upMetresPerSecond: 0,
  isDriving: false,
  isThrusting: false,
  isDrilling: false,
}

function poseAt(slot: string, seconds: number, isMotionReduced = false): PartPose {
  const pose = createPartPose()
  writeStationIdlePose(slot, seconds, isMotionReduced, pose)
  return pose
}

/** Every `step` seconds over `span` seconds, from a quarter step in so no sample sits on an edge. */
function samples(span: number, step: number): number[] {
  return Array.from({ length: Math.round(span / step) }, (_, index) => (index + 1 / 4) * step)
}

/** The pose after `seconds` of fixed steps at `stepsPerSecond`, as the vehicle loop steps it. */
function steppedPoseOf(slot: string, seconds: number, stepsPerSecond: number): PartPose {
  const motion = createPartMotion()
  for (let step = 0; step < seconds * stepsPerSecond; step++) {
    stepPartMotion(motion, IDLE, 1 / stepsPerSecond)
  }
  const pose = createPartPose()
  writePartPose(motion, slot, 0, false, pose)
  return pose
}

// The service station's idle parts (ticket 398): coil arcs, weld sparks and the ore conveyor.
describe('service station idle motion', () => {
  it('moves every idle part the station building names, and nothing else', () => {
    expect(shopBuildingMovingPartIdsOf('sell').every(isStationIdlePart)).toBe(true)
    for (const slot of ['platform-building-sell', 'workshop-gantry', 'wheel-2', 'sell-ticker']) {
      expect(isStationIdlePart(slot)).toBe(false)
    }
  })

  it('slides the ore up the belt by less than one cleat pitch, and starts over each pitch', () => {
    const pitchSeconds = STATION_CONVEYOR_PITCH_M / STATION_CONVEYOR_MPS
    for (const seconds of samples(3 * pitchSeconds, pitchSeconds / 7)) {
      const pose = poseAt('sell-conveyor', seconds)
      const along = Math.hypot(pose.x, pose.y)
      expect(along).toBeLessThan(STATION_CONVEYOR_PITCH_M)
      expect(pose.y * STATION_CONVEYOR_RUN_M).toBeCloseTo(pose.x * STATION_CONVEYOR_RISE_M, 9)
      expect(poseAt('sell-conveyor', seconds + pitchSeconds).x).toBeCloseTo(pose.x, 9)
      expect(pose.glow).toBe(0)
    }
    expect(poseAt('sell-conveyor', pitchSeconds / 2).y).toBeGreaterThan(0)
  })

  it('runs the belt the same at 30 and 144 steps/s', () => {
    const at30 = steppedPoseOf('sell-conveyor', 1.5, 30)
    const at144 = steppedPoseOf('sell-conveyor', 1.5, 144)
    expect(at144.x).toBeCloseTo(at30.x, 6)
    expect(at144.y).toBeCloseTo(at30.y, 6)
    expect(at30.x).toBeGreaterThan(0)
  })

  it('strikes each arc lit at about half the strikes, upright or flipped, and dark otherwise', () => {
    const poses = samples(20, 1 / 12).map((seconds) => poseAt('sell-arc', seconds))
    const lit = poses.filter((pose) => pose.scaleY !== 0)
    expect(new Set(poses.map((pose) => pose.scaleY))).toEqual(new Set([1, -1, 0]))
    expect(lit.length / poses.length).toBeGreaterThan(0.35)
    expect(lit.length / poses.length).toBeLessThan(0.65)
    expect(lit.every((pose) => pose.glow === STATION_ARC_GLOW)).toBe(true)
    expect(poses.filter((pose) => pose.scaleY === 0).every((pose) => pose.glow === 0)).toBe(true)
  })

  it('strikes the two arcs apart', () => {
    const times = samples(10, 1 / 12)
    const first = times.map((seconds) => poseAt('sell-arc', seconds).scaleY)
    const second = times.map((seconds) => poseAt('sell-arc-2', seconds).scaleY)
    expect(second).not.toEqual(first)
  })

  it('burns each weld for its burn of every cycle, the second half a cycle behind the first', () => {
    const half = STATION_WELD_CYCLE_SECONDS / 2
    for (const seconds of samples(3 * STATION_WELD_CYCLE_SECONDS, 1 / 20)) {
      const intoCycle = seconds % STATION_WELD_CYCLE_SECONDS
      const isBurning = intoCycle < STATION_WELD_BURN_SECONDS
      expect(poseAt('sell-spark', seconds).scaleY > 0).toBe(isBurning)
      expect(poseAt('sell-spark-2', seconds + half).scaleY > 0).toBe(isBurning)
    }
  })

  it('flickers and turns a burning weld star, never past its full size or glow', () => {
    const burning = samples(STATION_WELD_BURN_SECONDS, 1 / 20).map((seconds) =>
      poseAt('sell-spark', seconds),
    )
    expect(new Set(burning.map((pose) => pose.scaleY)).size).toBeGreaterThan(5)
    expect(new Set(burning.map((pose) => pose.angle)).size).toBeGreaterThan(5)
    for (const pose of burning) {
      expect(pose.scaleY).toBeGreaterThan(0)
      expect(pose.scaleY).toBeLessThanOrEqual(1)
      expect(pose.glow).toBeLessThanOrEqual(STATION_WELD_GLOW)
    }
  })

  it('holds the belt still and the arcs and welds steady with motion effects off (#48 acceptance 6)', () => {
    for (const seconds of samples(5, 1 / 10)) {
      expect(poseAt('sell-conveyor', seconds, true)).toEqual(createPartPose())
      expect(poseAt('sell-arc-2', seconds, true)).toMatchObject({ scaleY: 1, angle: 0 })
      expect(poseAt('sell-arc-2', seconds, true).glow).toBe(STATION_ARC_GLOW)
      expect(poseAt('sell-spark', seconds, true)).toMatchObject({ scaleY: 1, angle: 0 })
      expect(poseAt('sell-spark', seconds, true).glow).toBe(STATION_WELD_GLOW)
    }
  })

  it('glows the arcs and welds white, so their emissive maps’ own colours show', () => {
    expect(glowColourOf('sell-arc-2', '#80bdff')).toBe(STATION_GLOW_COLOUR)
    expect(glowColourOf('sell-spark', '#fff4c8')).toBe(STATION_GLOW_COLOUR)
  })
})
