import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CUT_FOLLOW_TICKS } from '../constants/balance'
import { MM_PER_METRE, PHYSICS_TIMESTEP, UP_VECTOR_SCALE } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { createVehicleLoop } from '../scene/vehicleLoop'
import { readAuthorityState } from '../store/authorityLink'
import {
  readAuthorityTick,
  readLocalVehicle,
  resetGameStore,
  useGameStore,
} from '../store/gameStore'
import { effectiveTravelSpeedOf } from '../systems/authority/travelSpeed'
import { ECONOMY } from '../systems/economy/economy'
import { buildIntent } from '../systems/input/buildIntent'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import type { VehiclePose } from '../systems/vehicle/vehiclePose'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleController,
  type VehicleStepResult,
} from './vehicleController'

// The cut-follow in the real fixed-step loop (ticket 333, TD acceptance on #316 scope 0), with
// `drill.sweptCut` on: the motor's cut gate is the one the authority keeps on every tick a drill
// step lands, the rig stops within 6 ticks of letting go of the drive, and back through the tunnel
// it carved it never beats travel parity's cap. Three rigs, three replays of the same script.

// The third rig cuts at about 15 m/s, the old 4-tick tile floor's pace: with no floor (ticket 397)
// #400's rig 2 cuts at 3600 m/s and jams on planet 1 (#439).
const RIGS: readonly Record<string, number>[] = [
  {},
  { drill_power: 300, drill_tip: 200 },
  { drill_power: 200, drill_tip: 600, engine: 5000 },
]

/**
 * The core's casing grade holds every band's lining (#41), so no collapse (#43) refills a tunnel
 * the rig drives back through. At 15 m/s the third rig lines some 30 m of tunnel in the level leg,
 * and at grade 1 its blocks fall in behind it.
 */
const HOLDING_CASING_GRADE = ECONOMY.casing.casingGradeCoreMin

/** A step's result with the authority's view after it. */
interface TickRead {
  result: VehicleStepResult
  /** The cut gate the tick's drill step left on the cursor, or null when no step landed. */
  authorityGate: 0 | 1 | null
  /** Travel parity's cap in m/s as the step started. */
  travelCap: number
}

/** Each leg's ticks, in script order. */
interface Run {
  offPad: TickRead[]
  down: TickRead[]
  level: TickRead[]
  release: TickRead[]
  back: TickRead[]
}

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

/** Off the pad, down a shaft, a level tunnel west, let go, then back east along it. */
function playScript(
  levels: Record<string, number>,
  casingGrade = ECONOMY.casing.casingGradeStart,
): Run {
  for (const [track, level] of Object.entries(levels)) {
    useGameStore.getState().setUpgrade(track, level)
  }
  useGameStore.getState().setCasingGrade(casingGrade)
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const controller = createVehicleController(RAPIER, world, createVehicleBody(RAPIER, world, start))
  const loop = createVehicleLoop({ 'drill.sweptCut': true })
  const hold = (intent: VehicleIntent, seconds: number) =>
    holdIntent(controller, intent, Math.round(seconds / PHYSICS_TIMESTEP), (stepped) => {
      loop.step(stepped, intent)
      stepped.stepWorld()
    })
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  return {
    offPad: hold(buildIntent(['aim_left']), 2),
    down: hold(buildIntent(['aim_down']), 3),
    level: hold(buildIntent(['aim_left']), 3),
    release: hold(IDLE_INTENT, 0.5),
    back: hold(buildIntent(['aim_right']), 0.4),
  }
}

function holdIntent(
  controller: VehicleController,
  intent: VehicleIntent,
  steps: number,
  stepOnce: (controller: VehicleController) => void,
): TickRead[] {
  const reads: TickRead[] = []
  let last: VehicleStepResult | null = null
  const watched: VehicleController = {
    ...controller,
    step: (input, planet) => (last = controller.step(input, planet)),
  }
  for (let step = 0; step < steps; step++) {
    if (step % 60 === 0) useGameStore.getState().setEnergy('150')
    const travelCap = effectiveTravelSpeedOf(readAuthorityState(), useGameStore.getState().playerId)
    stepOnce(watched)
    if (last === null) throw new Error('the loop has not stepped the body')
    reads.push({ result: last, authorityGate: gateLeftThisTick(), travelCap })
  }
  return reads
}

function gateLeftThisTick(): 0 | 1 | null {
  const cursor = readLocalVehicle().sweptCut
  return cursor?.tick === readAuthorityTick() ? cursor.cutGate : null
}

function allTicks(run: Run): TickRead[] {
  return [...run.offPad, ...run.down, ...run.level, ...run.release, ...run.back]
}

/** m/s along the ground, from the pose the step started at. */
function alongSpeedOf({ vx, vy, upx, upy }: VehiclePose): number {
  return Math.abs(vx * upy - vy * upx) / UP_VECTOR_SCALE / MM_PER_METRE
}

describe('cut-follow in the live loop (ticket 333)', () => {
  it.each(RIGS.map((levels, index) => [index + 1, levels] as const))(
    'replay %i: the motor gate equals the authority gate on every tick a step lands',
    (_, levels) => {
      const ticks = allTicks(playScript(levels))
      const landed = ticks.filter((read) => read.authorityGate !== null)
      expect(landed.length).toBeGreaterThan(60)
      expect(landed.some((read) => read.result.isCutting)).toBe(true)
      for (const read of landed) expect(read.result.isCutting ? 1 : 0).toBe(read.authorityGate)
    },
    120_000,
  )

  // Since ticket 399 the cut reaches only as far as its work pays for, so the face stands nearer
  // the body and the rig settles against it with a bump after it stops; the drive's own stop is
  // the pin here, and holding the body to the cut is K-bound's (#400).
  it('stops within 6 ticks of the drive letting go in a level cut', () => {
    const run = playScript(RIGS[2])
    expect(run.level.at(-1)?.result.isCutting).toBe(true)
    const ramp = run.release.slice(1, CUT_FOLLOW_TICKS + 1)
    expect(Math.min(...ramp.map(({ result }) => alongSpeedOf(result.pose)))).toBeLessThan(0.05)
    const after = run.release.slice(CUT_FOLLOW_TICKS)
    expect(after.every(({ result }) => !result.isCutting)).toBe(true)
  }, 120_000)

  it('never drives back through its own tunnel faster than travel parity allows', () => {
    const run = playScript(RIGS[2], HOLDING_CASING_GRADE)
    expect(run.back.every((read) => !read.result.isCutting)).toBe(true)
    for (const read of run.back) {
      expect(alongSpeedOf(read.result.pose)).toBeLessThanOrEqual(read.travelCap * 1.01)
    }
  }, 120_000)
})
