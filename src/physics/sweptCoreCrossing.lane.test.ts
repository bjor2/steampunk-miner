import RAPIER from '@dimforge/rapier3d-compat'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { STEP_BOUND_TOLERANCE_MM } from '../constants/balance'
import { MM_PER_METRE, PHYSICS_TIMESTEP, TICKS_PER_SECOND } from '../constants/physics'
import { DEV_FLAGS, type DevFlags } from '../constants/devFlags'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readAuthorityState, submitCommand } from '../store/authorityLink'
import { readLocalVehicle, resetGameStore, useGameStore } from '../store/gameStore'
import { setCasingGradeCommand } from '../systems/authority/casingDebugCommands'
import { stepBoundsAt } from '../systems/authority/stepBoundRead'
import { onCurveSteps } from '../systems/economy/vehicleStats'
import { buildIntent } from '../systems/input/buildIntent'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { stepBoundMmOf } from '../systems/vehicle/stepBound'
import { createVehicleLoop, type VehicleLoop } from '../scene/vehicleLoop'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { runFixedStepFrame, type FrameClock } from './liveFixedStep'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleController,
} from './vehicleController'

// The stored-200 rig on planet 1 with `drill.sweptCut` on (ticket 539, #514's finding 8): the
// planet-200 on-curve drill cuts band 1 at the law's top, a cell a sub-step (3600 m/s), so its
// down cut crosses planet 1's 300 m radius in about 10 ticks at 30 m a tick, inside its
// stats-derived step bound (60.25 m a tick cutting, `stepBound.ts`; drill speed has no cap, Bjor
// on #439). Planet 1 is smaller than a tick of that travel: before this ticket the cut drove the
// body past the planet's centre, `localUp` flipped under it, and the drill pushed it back, so it jumped 60 m
// out and 60 m back every tick (15 m and 5 m once the cut had widened the centre). The lane leaves
// the pad, holds the drill down until long after the body reached the centre, and asserts:
// - no tick moves the body further than its step bound for the gate it moved under;
// - no tick of the held down cut carries the body away from the centre by more than one density
//   sample (`STEP_BOUND_TOLERANCE_MM`): it stops at the centre instead of crossing it (since #724
//   a body falling through its own cleared bore, the gate shut, may swing past the centre and
//   back under gravity: that travel is a finding for the GD, logged as a todo);
// - the body reaches the centre (within 1 m, where `localUp` holds) and is still there at the end;
// - 30 and 144 frames/s play the same ticks.
// Each run prints its largest move with the body and cut cursor before and after it. A lane: it
// runs only when named.

const P200 = onCurveSteps(200)
const RIG = {
  drill_power: P200.drill_power,
  drill_tip: P200.drill_tip,
  hull: 5000,
  cargo_hold: 56,
}
const SWEPT_CUT_ON: DevFlags = { ...DEV_FLAGS, 'drill.sweptCut': true }
const FRAME_RATES = [30, 144]
const LEAVE_PAD_TICKS = Math.round(2 / PHYSICS_TIMESTEP)
/** Lining strong enough that a cave-in never crushes the rig (#514's loop lanes). */
const CASING_GRADE = 5
/** The rig rests after leaving the pad, so the down hold starts from rest. */
const SETTLE_TICKS = Math.round(1 / PHYSICS_TIMESTEP)
/**
 * Long enough to cross planet 1 and then hold at its centre for several seconds. Since Bjor's
 * ruling on #724 the cut down gains its speed from rest under gravity, so the crossing takes some
 * 7 s (about 426 ticks) rather than the 10-odd ticks the drill alone took.
 */
const DOWN_TICKS = 720
/** Below this distance `localUp` holds its last value (decision #7): the centre, for the body. */
const CENTRE_RADIUS_M = 1
const AWAY_TOLERANCE_M = STEP_BOUND_TOLERANCE_MM / MM_PER_METRE
const RUN_TIMEOUT_MS = 300_000

/** One tick of the held down cut. */
interface DownTick {
  tick: number
  before: Vector2
  after: Vector2
  movedM: number
  boundM: number
  isCutting: boolean
  cursorBefore: Vector2 | null
  cursorAfter: Vector2 | null
}

const largestMoves: string[] = []

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

afterAll(() => console.log(largestMoves.join('\n')))

/** A fresh stored-200 rig leaves the pad and settles, then holds the drill down, traced. */
function playDownThroughCentre(framesPerSecond: number): DownTick[] {
  const rig = createTracedRig(framesPerSecond)
  rig.hold(buildIntent(['aim_left']), LEAVE_PAD_TICKS)
  rig.hold(IDLE_INTENT, SETTLE_TICKS)
  return rig.hold(buildIntent(['aim_down']), DOWN_TICKS)
}

/** The live loop on a fresh store and world, each fixed tick traced as it steps. */
function createTracedRig(framesPerSecond: number) {
  resetGameStore()
  for (const [track, level] of Object.entries(RIG)) {
    useGameStore.getState().setUpgrade(track, level)
  }
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const controller = createVehicleController(RAPIER, world, createVehicleBody(RAPIER, world, start))
  const loop = createVehicleLoop(SWEPT_CUT_ON)
  submitCommand(useGameStore.getState().playerId, setCasingGradeCommand(CASING_GRADE))
  const clock: FrameClock = { carried: 0 }
  let stepped = 0
  const hold = (intent: VehicleIntent, ticks: number): DownTick[] => {
    const traced: DownTick[] = []
    const stepWorld = () => {
      if (stepped++ % TICKS_PER_SECOND === 0) useGameStore.getState().setEnergy('150')
      traced.push(traceTick(controller, loop, intent, traced.length + 1))
    }
    while (traced.length < ticks) {
      runFixedStepFrame(clock, 1 / framesPerSecond, { isHeld: () => false, stepWorld })
    }
    return traced.slice(0, ticks)
  }
  return { hold }
}

/** One fixed tick through the live loop, with the bound and the cursor it moved under. */
function traceTick(
  controller: VehicleController,
  loop: VehicleLoop,
  intent: VehicleIntent,
  tick: number,
): DownTick {
  const before = controller.planetPosition()
  const cursorBefore = cursorPoint()
  const bounds = stepBoundsAt(readAuthorityState(), useGameStore.getState().playerId)
  let isCutting = false
  const watched: VehicleController = {
    ...controller,
    step: (input, planet) => {
      const result = controller.step(input, planet)
      isCutting = result.isCutting
      return result
    },
  }
  loop.step(watched, intent)
  controller.stepWorld()
  const after = controller.planetPosition()
  const boundM = stepBoundMmOf(bounds, isCutting) / MM_PER_METRE
  const movedM = distance(before, after)
  return {
    tick,
    before,
    after,
    movedM,
    boundM,
    isCutting,
    cursorBefore,
    cursorAfter: cursorPoint(),
  }
}

/** The swept cut's cursor (its stamp's front), planet metres; null before the first step. */
function cursorPoint(): Vector2 | null {
  const cursor = readLocalVehicle().sweptCut
  if (cursor === undefined) return null
  return { x: cursor.xMm / MM_PER_METRE, y: cursor.yMm / MM_PER_METRE }
}

function distance(a: Vector2, b: Vector2): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function radiusOf(point: Vector2): number {
  return Math.hypot(point.x, point.y)
}

function movedAwayM(tick: DownTick): number {
  return radiusOf(tick.after) - radiusOf(tick.before)
}

function overBoundTicks(ticks: readonly DownTick[]): string[] {
  return ticks.filter((tick) => tick.movedM > tick.boundM).map(describeTick)
}

/**
 * The ticks the held cut carried the body away from the centre. Since Bjor's ruling on #724 the
 * body reaches the core still gaining speed under gravity, and once its cut has cleared the bore
 * ahead the gate shuts and it falls through the centre like any falling body, swinging back to
 * it: travel under gravity, not the cut, so only cutting ticks are judged here.
 */
function awayFromCentreTicks(ticks: readonly DownTick[]): string[] {
  return ticks
    .filter((tick) => tick.isCutting && movedAwayM(tick) > AWAY_TOLERANCE_M)
    .map(describeTick)
}

function firstTickAtCentre(ticks: readonly DownTick[]): number | undefined {
  return ticks.find((tick) => radiusOf(tick.after) < CENTRE_RADIUS_M)?.tick
}

function largestMoveOf(ticks: readonly DownTick[]): DownTick {
  return ticks.reduce((largest, tick) => (tick.movedM > largest.movedM ? tick : largest))
}

function describeTick(tick: DownTick): string {
  return [
    `tick ${tick.tick}: moved ${tick.movedM.toFixed(2)} m (bound ${tick.boundM.toFixed(2)},`,
    `${tick.isCutting ? 'cutting' : 'gate shut'}), radius ${radiusOf(tick.before).toFixed(2)} ->`,
    `${radiusOf(tick.after).toFixed(2)}, body ${pointText(tick.before)} -> ${pointText(tick.after)},`,
    `cursor ${pointText(tick.cursorBefore)} -> ${pointText(tick.cursorAfter)}`,
  ].join(' ')
}

function pointText(point: Vector2 | null): string {
  return point === null ? 'none' : `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`
}

describe('swept cut through the planet 1 centre (ticket 539)', () => {
  const runs = new Map<number, DownTick[]>()
  const runAt = (framesPerSecond: number) => {
    const known = runs.get(framesPerSecond)
    if (known !== undefined) return known
    const ticks = playDownThroughCentre(framesPerSecond)
    runs.set(framesPerSecond, ticks)
    largestMoves.push(
      `${framesPerSecond} frames/s largest move, ${describeTick(largestMoveOf(ticks))}`,
    )
    return ticks
  }

  it.each(FRAME_RATES)(
    'never moves the stored-200 body past its step bound in a tick, at %i frames/s',
    (framesPerSecond) => {
      expect(overBoundTicks(runAt(framesPerSecond))).toEqual([])
    },
    RUN_TIMEOUT_MS,
  )

  it.each(FRAME_RATES)(
    'stops a held down cut at the centre instead of carrying the body out past it, at %i frames/s',
    (framesPerSecond) => {
      expect(awayFromCentreTicks(runAt(framesPerSecond))).toEqual([])
    },
    RUN_TIMEOUT_MS,
  )

  it.each(FRAME_RATES)(
    'reaches the centre and is still there when the hold ends, at %i frames/s',
    (framesPerSecond) => {
      const ticks = runAt(framesPerSecond)
      expect(firstTickAtCentre(ticks)).toBeDefined()
      expect(radiusOf(ticks[ticks.length - 1].after)).toBeLessThan(CENTRE_RADIUS_M)
    },
    RUN_TIMEOUT_MS,
  )

  it(
    'plays the same ticks at 30 and 144 frames/s',
    () => {
      expect(runAt(144)).toEqual(runAt(30))
    },
    RUN_TIMEOUT_MS,
  )

  it.todo(
    "catches a body that falls through its own cleared bore at the centre (#724 finding: the stored-200 rig, gaining speed under gravity, swings some 24 m past planet 1's centre and back with the gate shut; owner: the GD)",
  )
})
