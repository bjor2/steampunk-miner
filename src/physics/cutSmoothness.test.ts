import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CUT_FOLLOW_TICKS } from '../constants/balance'
import { PHYSICS_TIMESTEP, UP_VECTOR_SCALE } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { createVehicleLoop } from '../scene/vehicleLoop'
import { readAuthorityState } from '../store/authorityLink'
import { readLocalVehicle, resetGameStore, useGameStore } from '../store/gameStore'
import type { CutFollow } from '../systems/authority/cutFollowRead'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { buildIntent } from '../systems/input/buildIntent'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { facingVectorOf } from '../systems/vehicle/vehiclePose'
import { groundReaderOf } from '../systems/world/groundReader'
import { ISO_DENSITY } from '../systems/world/sampleGrid'
import { runFixedStepFrame, type FrameClock } from './liveFixedStep'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleController,
  type VehicleStepResult,
} from './vehicleController'

// Continuous cut-follow (K-bound, ticket 400, from the #397 TD lock): once a cut has ramped up the
// body holds the drill's speed across cell boundaries, its speed varying by at most 5% there, and
// it never ends a tick inside solid ground. The fixed step runs under render frames at 30 and at
// 144 frames a second, which must step the rig the same. The level cut's boundaries are asked of
// the planner on #400: its body still meets a one-sample lip of uncut ground at its lower front.

const RIGS: readonly Record<string, number>[] = [
  { drill_power: 300, drill_tip: 200 },
  { drill_power: 2000, drill_tip: 600, engine: 5000 },
]
const FRAME_RATES = [30, 144]
const MAX_BOUNDARY_CHANGE = 0.05

/** One fixed tick of the script, read after it. */
interface TickRead {
  result: VehicleStepResult
  /** The cut-follow read the step took; undefined with none. */
  read: CutFollow | undefined
  /** The body's centre after the tick, planet metres. */
  position: { x: number; y: number }
  isInsideGround: boolean
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

/** Off the pad, down a shaft, then a level tunnel west, at `framesPerSecond` render frames. */
function playScript(levels: Record<string, number>, framesPerSecond: number) {
  for (const [track, level] of Object.entries(levels)) {
    useGameStore.getState().setUpgrade(track, level)
  }
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const controller = createVehicleController(RAPIER, world, createVehicleBody(RAPIER, world, start))
  const loop = createVehicleLoop({ 'drill.sweptCut': true })
  const clock: FrameClock = { carried: 0 }
  const hold = (intent: VehicleIntent, seconds: number) => {
    const reads: TickRead[] = []
    const live = {
      isHeld: () => false,
      stepWorld: () => reads.push(stepTick(controller, loop, intent)),
    }
    for (let frame = 0; frame < seconds * framesPerSecond; frame++) {
      if (frame % framesPerSecond === 0) useGameStore.getState().setEnergy('150')
      runFixedStepFrame(clock, 1 / framesPerSecond, live)
    }
    return reads
  }
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  hold(buildIntent(['aim_left']), 2)
  return { down: hold(buildIntent(['aim_down']), 3), level: hold(buildIntent(['aim_left']), 3) }
}

/** One fixed tick through the live loop, with the cut-follow read its step took. */
function stepTick(
  controller: VehicleController,
  loop: ReturnType<typeof createVehicleLoop>,
  intent: VehicleIntent,
): TickRead {
  let result: VehicleStepResult | null = null
  let read: CutFollow | undefined
  const watched: VehicleController = {
    ...controller,
    step: (input, planet) => {
      const cutFollowOf = input.cutFollowOf
      const reading =
        cutFollowOf && ((step: Parameters<typeof cutFollowOf>[0]) => (read = cutFollowOf(step)))
      result = controller.step({ ...input, cutFollowOf: reading }, planet)
      return result
    },
  }
  loop.step(watched, intent)
  watched.stepWorld()
  if (result === null) throw new Error('the loop has not stepped the body')
  const position = controller.planetPosition()
  return { result, read, position, isInsideGround: isInsideGround(position) }
}

/** The body's centre sits in solid ground as the authority's world stands after the tick. */
function isInsideGround({ x, y }: { x: number; y: number }): boolean {
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)
  if (params === null) return false
  return groundReaderOf(state.world, params).densityAtPoint(x, y) >= ISO_DENSITY
}

/** m/s along the facing over tick `at`, from the body's move through it. */
function speedAlongFacingAt(ticks: readonly TickRead[], at: number): number {
  const { pose } = ticks[at].result
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  const dx = ticks[at].position.x - ticks[at - 1].position.x
  const dy = ticks[at].position.y - ticks[at - 1].position.y
  return (dx * facing.x + dy * facing.y) / UP_VECTOR_SCALE / PHYSICS_TIMESTEP
}

/** The tick crossed into another cell, the ramp long done and the drill's speed unchanged round it. */
function isHeldBoundary(ticks: readonly TickRead[], at: number): boolean {
  if (at < CUT_FOLLOW_TICKS + 2 || at + 1 >= ticks.length) return false
  const around = ticks.slice(at - CUT_FOLLOW_TICKS - 2, at + 2)
  const speed = ticks[at].read?.cutSpeed
  const isSteady = around.every(({ result, read }) => result.isCutting && read?.cutSpeed === speed)
  return isSteady && !isSameCell(ticks[at - 1].position, ticks[at].position)
}

function isSameCell(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.floor(a.x) === Math.floor(b.x) && Math.floor(a.y) === Math.floor(b.y)
}

/** The largest share the speed changes by across each held boundary, and how many were met. */
function boundaryChangesOf(ticks: readonly TickRead[]): number[] {
  const changes: number[] = []
  for (let at = 1; at < ticks.length; at++) {
    if (!isHeldBoundary(ticks, at)) continue
    const before = speedAlongFacingAt(ticks, at - 1)
    const across = [at, at + 1].map((tick) => speedAlongFacingAt(ticks, tick))
    changes.push(Math.max(...across.map((speed) => Math.abs(speed - before) / before)))
  }
  return changes
}

describe('continuous cut-follow (ticket 400)', () => {
  it.each(RIGS.map((levels, index) => [index + 1, levels] as const))(
    'rig %i: varies its speed by at most 5% across cell boundaries down, at 30 and 144 frames/s',
    (_, levels) => {
      for (const framesPerSecond of FRAME_RATES) {
        resetGameStore()
        const changes = boundaryChangesOf(playScript(levels, framesPerSecond).down)
        expect(changes.length).toBeGreaterThan(2)
        expect(Math.max(...changes)).toBeLessThanOrEqual(MAX_BOUNDARY_CHANGE)
      }
    },
    120_000,
  )

  it.todo('varies its speed by at most 5% across cell boundaries in a level cut (asked on #400)')

  it.each(RIGS.map((levels, index) => [index + 1, levels] as const))(
    'rig %i: never ends a tick inside solid ground, and steps alike at 30 and 144 frames/s',
    (_, levels) => {
      const paths = FRAME_RATES.map((framesPerSecond) => {
        resetGameStore()
        const run = playScript(levels, framesPerSecond)
        const ticks = [...run.down, ...run.level]
        expect(ticks.filter((tick) => tick.isInsideGround)).toEqual([])
        return ticks.map(({ position }) => position)
      })
      expect(paths[0]).toEqual(paths[1])
    },
    120_000,
  )
})
