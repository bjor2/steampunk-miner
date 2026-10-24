import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DRIVE_PUSH_STEPS, MM_PER_METRE, PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readLocalVehicle, resetGameStore } from '../store/gameStore'
import { buildIntent } from '../systems/input/buildIntent'
import { driveSpeedOf } from '../systems/vehicle/cutCapSpeed'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { createRig, type TickRead } from './cutFollowFixtures'

// Ticket 791: an analog push down and to the left aims the drill between the facings, and the rig
// digs a diagonal shaft in the live fixed-step loop with `drill.sweptCut` on: the body goes down
// and sideways together, its sideways speed never past the drive's (Bjor's rule on the sideways
// part of a diagonal cut), alike at 30 and 144 frames a second.

const RIG = { drill_power: 12 }
const DOWN_LEFT: VehicleIntent = { moveX: -DRIVE_PUSH_STEPS, aim: 40, lift: false }
const LEG_SECONDS = 4
const ticks = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => {
  uninstallRunLog()
  resetGameStore()
})

/** Off the pad to the left, then a push down-left for the leg. */
function playDiagonal(framesPerSecond: number): { leg: TickRead[]; driveSpeed: number } {
  const rig = createRig(RAPIER, RIG, framesPerSecond)
  rig.hold(buildIntent(['aim_left']), ticks(2))
  return {
    leg: rig.hold(DOWN_LEFT, ticks(LEG_SECONDS)),
    driveSpeed: driveSpeedOf(readLocalVehicle()),
  }
}

/** The tick's velocity along the local tangent (right +) and `localUp`, m/s. */
function localSpeedOf({ result }: TickRead): { along: number; upward: number } {
  const { vx, vy, upx, upy } = result.pose
  const scale = Math.hypot(upx, upy) * MM_PER_METRE
  return { along: (vx * upy - vy * upx) / scale, upward: (vx * upx + vy * upy) / scale }
}

describe('diagonal cut (ticket 791)', () => {
  it.each([30, 144])('digs down and to the left together at %i frames a second', (rate) => {
    const { leg } = playDiagonal(rate)
    const [first, last] = [leg[0].position, leg[leg.length - 1].position]
    const drilled = leg.filter((tick) => tick.result.flags.isDrilling)
    expect(drilled.length).toBeGreaterThan(leg.length / 2)
    expect(last.x - first.x).toBeLessThan(-1.5)
    expect(last.y - first.y).toBeLessThan(-1.5)
    expect(drilled.every((tick) => tick.result.pose.aim === 40)).toBe(true)
  })

  it('never moves the rig sideways faster than the drive while it cuts', () => {
    const { leg, driveSpeed } = playDiagonal(60)
    const cutting = leg.filter((tick) => tick.result.isCutting)
    expect(cutting.length).toBeGreaterThan(0)
    for (const tick of cutting) {
      expect(Math.abs(localSpeedOf(tick).along)).toBeLessThanOrEqual(driveSpeed + 0.01)
    }
  })

  it('reaches the same place at 30 and 144 frames a second', () => {
    const at = (rate: number) => playDiagonal(rate).leg.at(-1)?.result.pose
    expect(at(144)).toEqual(at(30))
  })
})
