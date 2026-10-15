import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CUT_FOLLOW_TICKS, MAX_SPEED_MM_PER_SECOND } from '../constants/balance'
import { MM_PER_METRE, PHYSICS_TIMESTEP, UP_VECTOR_SCALE } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { ECONOMY } from '../systems/economy/economy'
import { sweptDrillStampOf } from '../systems/vehicle/drillStamp'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import type { VehiclePose } from '../systems/vehicle/vehiclePose'
import type { SweptCut } from '../systems/vehicle/sweptCut'
import type { VehicleController, VehicleStepResult } from './vehicleController'

// The swept cut in the real fixed-step loop (ticket 330 acceptance, Vertical Scaler on #316): with
// `drill.sweptCut` on and the drill held at its floor (drill and engine far past the curve, the
// tank refilled), the vehicle digs down and level faster than the 5 Hz report's cut and its wheels
// never wait on the cut past a report interval. The speeds are logged, not gated (TD and GD rulings
// on #330, Q1 (a)), at the floors 24, 12, 8 and 4, each tick tagged with what held the body back so
// the 8-tick floor's limiter is measured, not inferred. The floor is `economy.json`'s
// `minTicksPerTile`, swapped in on a fresh module graph with no slices registered (a kernel spec
// never imports one), as `store/authorityReads.test.ts` does.

/** Steps past the curve, as the TD's #316 runs: the drill bound by the floor, speedMax ~14. */
const FLOOR_BOUND_LEVELS = { drill_power: 2000, drill_tip: 600, engine: 5000 } as const
const SECONDS = 6
/** The steady rate is read over the last half of each run. */
const STEADY_FROM_SECONDS = 3
/** A speed this close to a bound counts as held by it. */
const NEAR_BOUND = 0.98
/** The longest the wheels may wait on the cut: the 5 Hz report interval (ticket 330). */
const MAX_WAIT_TICKS = 12

/**
 * Since ticket 399 a cell costs its whole drill time and the cut reaches only as far as its work
 * pays for, so at a boundary the wheels may wait out one cell at the floor and the cut-follow's
 * ramp; holding the body to the cut is K-bound's (#400).
 */
const maxWaitTicksAt = (floor: number) => Math.max(MAX_WAIT_TICKS, floor + CUT_FOLLOW_TICKS)

/**
 * What held the body back on a drilling tick (TD ruling on #330, VS pin 2): the sweep stopping short
 * of the stamp (the per-cell budget never does, ticket 335, but since ticket 399 the work does: the
 * cut reaches as far as its work pays for, so this counts the cut front), the pose bound (the 18 m/s clamp, the stats-derived bound swept, or a refused step), the engine's top speed along the
 * ground, the wheels waiting on ground in a level cut's way, else the cut front itself. A tick the
 * drill does not bite (the body falling or rolling through ground already cut) is `undrilled`.
 */
type Limiter = 'short' | 'pose' | 'speedMax' | 'wait' | 'cut'
type LimiterCounts = Record<Limiter | 'undrilled', number>

/**
 * One fixed step: the body's step, the pose the authority held when the step was sent (a report
 * due the same tick lands after it) and the swept cut's cursor after it.
 */
interface TickRead {
  result: VehicleStepResult
  reportedPose: VehiclePose | null
  cursor: SweptCut | undefined
  tick: number
  /** How far ahead of the pose the swept stamp sat (ticket 334). */
  stampAheadMm: number
  /** The pose bound the body was clamped to, mm/s. */
  poseBoundMmPerSecond: number
}

interface Leg {
  /** Metres a second over the steady half. */
  rate: number
  limiters: LimiterCounts
  longestWaitTicks: number
}

interface Run {
  down: Leg
  level: Leg
}

async function playFloorBound(minTicksPerTile: number, isSwept: boolean): Promise<Run> {
  vi.resetModules()
  vi.doMock('../systems/economy/economy', () => ({
    ECONOMY: { ...ECONOMY, drill: { ...ECONOMY.drill, minTicksPerTile } },
  }))
  ;(await import('../registries/registrar')).loadSlices([])
  const runLog = await import('../logging/runLog')
  const store = await import('../store/gameStore')
  const { createVehicleLoop } = await import('../scene/vehicleLoop')
  const { createVehicleBody, createVehicleController } = await import('./vehicleController')
  const { buildIntent } = await import('../systems/input/buildIntent')
  const { engineStatsAtStep } = await import('../systems/economy/vehicleStats')
  const { readAuthorityState } = await import('../store/authorityLink')
  const bounds = await import('../systems/authority/stepBoundRead')
  const { reportSpeedOfStepBound, stepBoundMmOf } = await import('../systems/vehicle/stepBound')
  store.resetGameStore()
  const log = { runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }
  runLog.installRunLog(runLog.createRunLog(log))
  const game = store.useGameStore.getState()
  for (const [track, level] of Object.entries(FLOOR_BOUND_LEVELS)) game.setUpgrade(track, level)
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = store.readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const watched = watchSteps(
    createVehicleController(RAPIER, world, createVehicleBody(RAPIER, world, start)),
  )
  const loop = createVehicleLoop({ 'drill.sweptCut': isSwept })
  const speedMaxMm = engineStatsAtStep(FLOOR_BOUND_LEVELS.engine).speedMax * MM_PER_METRE
  const hold = (intent: VehicleIntent, seconds: number, each?: (read: TickRead) => void) => {
    for (let step = 0; step < Math.round(seconds / PHYSICS_TIMESTEP); step++) {
      if (step % 60 === 0) store.useGameStore.getState().setEnergy('150')
      const reportedPose = store.readLocalVehicle().pose
      const playerId = store.useGameStore.getState().playerId
      const stampAheadMm = bounds.sweptStampAheadMmAt(readAuthorityState(), playerId)
      loop.step(watched.controller, intent)
      watched.controller.stepWorld()
      const cursor = store.readLocalVehicle().sweptCut
      const tick = store.readAuthorityTick()
      const isCutting = cursor?.tick === tick && cursor.cutGate === 1
      const boundMm = stepBoundMmOf(bounds.stepBoundsAt(readAuthorityState(), playerId), isCutting)
      const poseBoundMmPerSecond = isSwept
        ? reportSpeedOfStepBound(boundMm)
        : MAX_SPEED_MM_PER_SECOND
      each?.({
        result: watched.last(),
        reportedPose,
        cursor,
        tick,
        stampAheadMm,
        poseBoundMmPerSecond,
      })
    }
  }
  const playLeg = (intent: VehicleIntent, along: () => number): Leg => {
    hold(intent, STEADY_FROM_SECONDS)
    const from = along()
    const tally = createTally(isSwept, speedMaxMm)
    hold(intent, SECONDS - STEADY_FROM_SECONDS, tally.note)
    const rate = (along() - from) / (SECONDS - STEADY_FROM_SECONDS)
    return { rate, limiters: tally.limiters, longestWaitTicks: tally.wait.longest }
  }
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  hold(buildIntent(['aim_left']), 2)
  const down = playLeg(buildIntent(['aim_down']), () => -watched.controller.planetPosition().y)
  const level = playLeg(buildIntent(['aim_left']), () => -watched.controller.planetPosition().x)
  runLog.uninstallRunLog()
  return { down, level }
}

/** The controller, with its last step's result kept for the spec to read. */
function watchSteps(controller: VehicleController) {
  let last: VehicleStepResult | null = null
  const watching: VehicleController = {
    ...controller,
    step: (input, planet) => (last = controller.step(input, planet)),
  }
  return {
    controller: watching,
    last: (): VehicleStepResult => {
      if (last === null) throw new Error('the loop has not stepped the body')
      return last
    },
  }
}

/** Counts each tick's limiter and the longest run of ticks the wheels waited on the cut. */
function createTally(isSwept: boolean, speedMaxMm: number) {
  const limiters: LimiterCounts = { short: 0, pose: 0, speedMax: 0, wait: 0, cut: 0, undrilled: 0 }
  const wait = { current: 0, longest: 0 }
  const note = (read: TickRead) => {
    limiters[limiterOf(read, isSwept, speedMaxMm)] += 1
    wait.current = read.result.isWaitingForCut ? wait.current + 1 : 0
    wait.longest = Math.max(wait.longest, wait.current)
  }
  return { limiters, wait, note }
}

function limiterOf(read: TickRead, isSwept: boolean, speedMaxMm: number): Limiter | 'undrilled' {
  if (!read.result.flags.isDrilling) return 'undrilled'
  if (isSwept && isSweepShort(read)) return 'short'
  if (isPoseBound(read, isSwept)) return 'pose'
  if (alongSpeedOf(read.result.pose) >= speedMaxMm * NEAR_BOUND) return 'speedMax'
  if (read.result.isWaitingForCut) return 'wait'
  return 'cut'
}

/** The tick's sweep stopped before the stamp at the step's position (`sweptDrill.ts`). */
function isSweepShort(read: TickRead): boolean {
  const { result, reportedPose, cursor, tick } = read
  if (cursor === undefined || cursor.tick !== tick || reportedPose === null) return false
  const pose = { ...reportedPose, x: result.pose.x, y: result.pose.y }
  const stamp = sweptDrillStampOf(pose, false, read.stampAheadMm)
  return cursor.xMm !== stamp.xMm || cursor.yMm !== stamp.yMm
}

/** At the pose bound's speed, or (swept) the tick's step was refused. */
function isPoseBound(read: TickRead, isSwept: boolean): boolean {
  if (isSwept && read.cursor?.tick !== read.tick) return true
  return speedOf(read.result.pose) >= read.poseBoundMmPerSecond * NEAR_BOUND
}

function speedOf({ vx, vy }: VehiclePose): number {
  return Math.sqrt(vx * vx + vy * vy)
}

/** The speed along the ground, the one the wheels drive toward the engine's top speed. */
function alongSpeedOf({ vx, vy, upx, upy }: VehiclePose): number {
  return Math.abs(vx * upy - vy * upx) / UP_VECTOR_SCALE
}

beforeAll(async () => {
  await RAPIER.init()
})

describe('swept cut in the live loop (ticket 330)', () => {
  // The gate is that the cut keeps up: it digs faster than the 5 Hz per-report cut and never holds
  // the wheels past a report interval or one cell at the floor. Since ticket 399 the work picks how
  // far each tick cuts, so the sweep may stop short of the stamp (TD ruling on #399 amending 335).
  // The rates and each leg's limiter counts are logged for #316's break order and the #304/#307
  // re-baseline.
  it.each([24, 12, 8, 4])(
    'digs faster than the per-report cut and never stalls at the %i-tick floor',
    async (floor) => {
      const swept = await playFloorBound(floor, true)
      const reported = await playFloorBound(floor, false)
      console.log(`swept cut, ${floor}-tick floor: ${JSON.stringify({ swept, reported })}`)
      expect(swept.down.rate).toBeGreaterThan(reported.down.rate)
      expect(swept.level.rate).toBeGreaterThan(reported.level.rate)
      expect(swept.level.longestWaitTicks).toBeLessThanOrEqual(maxWaitTicksAt(floor))
      expect(swept.down.longestWaitTicks).toBeLessThanOrEqual(maxWaitTicksAt(floor))
    },
    180_000,
  )
})
