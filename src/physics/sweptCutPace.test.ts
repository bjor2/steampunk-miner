import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { DEV_FLAGS, type DevFlags } from '../constants/devFlags'
import { MAX_SPEED_MM_PER_SECOND } from '../constants/balance'
import { MM_PER_METRE, PHYSICS_TIMESTEP, UP_VECTOR_SCALE } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { sweptDrillStampOf } from '../systems/vehicle/drillStamp'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import type { VehiclePose } from '../systems/vehicle/vehiclePose'
import type { SweptCut } from '../systems/vehicle/sweptCut'
import type { VehicleController, VehicleStepResult } from './vehicleController'

// The swept cut in the real fixed-step loop (ticket 330 acceptance, Vertical Scaler on #316): with
// `drill.sweptCut` on, an engine and tip far past the curve and the tank refilled, the vehicle digs
// down and level faster than the 5 Hz report's cut and its wheels never wait on the cut past a
// report interval. The speeds are logged, not gated (TD and GD rulings on #330, Q1 (a)), for drills
// cutting band 1 in about 24, 12, 8 and 4 ticks a cell (the tile floors this spec swept before
// ticket 397 took the floor out of the drill law), each tick tagged with what held the body back so
// the limiter is measured, not inferred. It runs on a fresh module graph with no slices registered
// (a kernel spec never imports one), as `store/authorityReads.test.ts` does.
// The per-report cut it compares against is pinned at 12 ticks, #514's kill-switch off (GD and VS
// Q5 on #514): the gate keeps its meaning, and the flag-off cadence of a report every tick while the
// drill bites (with the exact carry on, which it ships with, TD 6236464931) is logged beside it.
// Finding recorded on #514: at that cadence flag-off digs faster down than the swept cut at slow
// drills; the swept kernel is frozen and dark.

/** Steps past the curve, as the TD's #316 runs: speedMax ~14, a tip that cuts at full efficiency. */
const RIG_LEVELS = { drill_tip: 600, engine: 5000 } as const

/**
 * drill_power purchases (#552; the old majors 5, 11, 14 and 20 took 23, 12, 9 and 5) and the
 * ticks each takes on a band-1 cell.
 */
const DRILLS = [
  { drillPower: 4, ticksPerCell: 21 },
  { drillPower: 7, ticksPerCell: 11 },
  { drillPower: 9, ticksPerCell: 7 },
  { drillPower: 12, ticksPerCell: 4 },
]
const SECONDS = 6
/** The steady rate is read over the last half of each run. */
const STEADY_FROM_SECONDS = 3
/** A speed this close to a bound counts as held by it. */
const NEAR_BOUND = 0.98
/** The longest the wheels may wait on the cut: the 5 Hz report interval (ticket 330). */
const MAX_WAIT_TICKS = 12

/** A path: the client's flags and the authority's `drill.exactCarry`, which every tick needs. */
interface Path {
  flags: DevFlags
  isExactCarry: boolean
}
const SWEPT: Path = { flags: { ...DEV_FLAGS, 'drill.sweptCut': true }, isExactCarry: false }
/** The 5 Hz per-report cut this gate was written against: flag off, #514's kill-switch off. */
const PER_REPORT_AT_12: Path = {
  flags: { 'drill.sweptCut': false, 'drill.reportEveryTick': false },
  isExactCarry: false,
}
/** Flag off at a report every tick while the drill bites, as it ships with the exact carry (514). */
const PER_REPORT_EVERY_TICK: Path = {
  flags: { ...DEV_FLAGS, 'drill.sweptCut': false },
  isExactCarry: true,
}

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

async function playAtDrill(drillPower: number, { flags, isExactCarry }: Path): Promise<Run> {
  const isSwept = flags['drill.sweptCut']
  vi.resetModules()
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
  const { withDrillExactCarry } = await import('../systems/authority/cutCarryFixtures')
  return withDrillExactCarry(isExactCarry, () => {
    store.resetGameStore()
    const log = { runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }
    runLog.installRunLog(runLog.createRunLog(log))
    const game = store.useGameStore.getState()
    const levels = { ...RIG_LEVELS, drill_power: drillPower }
    for (const [track, level] of Object.entries(levels)) game.setUpgrade(track, level)
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    world.timestep = PHYSICS_TIMESTEP
    const start = store.readLocalVehicle().pose
    if (start === null) throw new Error('the starting planet has no dock')
    const watched = watchSteps(
      createVehicleController(RAPIER, world, createVehicleBody(RAPIER, world, start)),
    )
    const loop = createVehicleLoop(flags)
    const speedMaxMm = engineStatsAtStep(RIG_LEVELS.engine).speedMax * MM_PER_METRE
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
        const boundMm = stepBoundMmOf(
          bounds.stepBoundsAt(readAuthorityState(), playerId),
          isCutting,
        )
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
  })
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
  it('names the ticks each drill takes on a band-1 cell of planet 1', async () => {
    const { ticksPerTile } = await import('../systems/vehicle/drillRule')
    const { vehicleStatsAt, startLevels } = await import('../systems/economy/vehicleStats')
    const { blockHardness } = await import('../systems/economy/oreEconomy')
    const ticksOf = (drillPower: number) =>
      ticksPerTile(
        vehicleStatsAt({ ...startLevels(), ...RIG_LEVELS, drill_power: drillPower }),
        blockHardness(1, 1),
      )
    expect(DRILLS.map(({ drillPower }) => ticksOf(drillPower))).toEqual(
      DRILLS.map(({ ticksPerCell }) => ticksPerCell),
    )
  })

  // The gate is that the cut keeps up: it digs faster than the 5 Hz per-report cut and never holds
  // the wheels past a report interval. Since ticket 399 the work picks how far each tick cuts, so
  // the sweep may stop short of the stamp (TD ruling on #399 amending 335). The rates and each
  // leg's limiter counts are logged for #316's break order and the #304/#307 re-baseline.
  it.each(DRILLS)(
    'digs faster than the per-report cut and never stalls at $ticksPerCell ticks a cell',
    async ({ drillPower, ticksPerCell }) => {
      const swept = await playAtDrill(drillPower, SWEPT)
      const reported = await playAtDrill(drillPower, PER_REPORT_AT_12)
      const everyTick = await playAtDrill(drillPower, PER_REPORT_EVERY_TICK)
      const reportedEveryTick = { down: everyTick.down.rate, level: everyTick.level.rate }
      const rates = JSON.stringify({ swept, reported, reportedEveryTick })
      console.log(`swept cut, ${ticksPerCell} ticks a cell: ${rates}`)
      expect(swept.down.rate).toBeGreaterThan(reported.down.rate)
      expect(swept.level.rate).toBeGreaterThan(reported.level.rate)
      expect(swept.level.longestWaitTicks).toBeLessThanOrEqual(MAX_WAIT_TICKS)
      expect(swept.down.longestWaitTicks).toBeLessThanOrEqual(MAX_WAIT_TICKS)
    },
    270_000,
  )
})
