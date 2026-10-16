import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEV_FLAGS } from '../constants/devFlags'
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
import type { CutFollow } from '../systems/authority/cutFollowRead'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { buildIntent } from '../systems/input/buildIntent'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { IDLE_INTENT, type VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { groundProbeOf } from '../systems/vehicle/vehicleMotion'
import { facingVectorOf, type VehiclePose } from '../systems/vehicle/vehiclePose'
import { groundReaderOf } from '../systems/world/groundReader'
import { ISO_DENSITY } from '../systems/world/sampleGrid'
import type { WorldState } from '../systems/world/worldState'
import { runFixedStepFrame, type FrameClock } from './liveFixedStep'
import {
  createVehicleBody,
  createVehicleController,
  type VehicleController,
  type VehicleStepResult,
} from './vehicleController'

// Level release phases, tick by tick (ticket 458, measurement only, from #421's lip todo): the
// release sweep of `cutFollowRelease.test.ts` (off the pad, down, level west for 2.5 s plus a
// phase, then let go) for the 15 m/s rig and the rig-heavy one at 30 and 144 frames/s with
// `drill.sweptCut` on. Each traced tick records the commanded cut speed, the speed the motor set,
// the body's speed over the tick, the gate, the cut's reach and carry, the deepest contact at the
// body's lower front and the gap from the front to collider-solid ground just above the wheel line
// (the face's toe). Each followed release is named: stopped within 6 ticks, bounced off the toe
// (the stop ramp drove the lower front into it, and the contact pushes the body back for longer
// than the window) or a ramp that ran out (#460). A lane: it runs only when named, prints the table
// and writes the trace to balance-report/level-release-trace.ndjson for the fix tickets to re-run.

const RIGS: Readonly<Record<string, Record<string, number>>> = {
  '15 m/s rig': { drill_power: 200, drill_tip: 600, engine: 5000 },
  'rig-heavy 15 m/s': {
    drill_power: 200,
    drill_tip: 600,
    engine: 5000,
    hull: 5000,
    cargo_hold: 5000,
  },
}
const FRAME_RATES = [30, 144]
/** As `cutFollowRelease.test.ts`: a cell's drill time at the slowest starting drill, in ticks. */
const RELEASE_PHASES = 40
/** The pressed ticks traced before letting go, and the ticks past the 6-tick stop window. */
const PRESSED_TICKS_TRACED = 8
const TICKS_TRACED_PAST_WINDOW = 6
/** #397's 5% line, the stop line and the backward line, as the release sweep reads them. */
const HELD_SHARE = 0.05
const STOPPED_MPS = 0.05
const BACKWARDS_M_PER_S = -0.02
/** The level release phases main followed before ticket 421 (`MAIN_FOLLOWED_LEVEL`). */
const MAIN_FOLLOWED_PHASES: Readonly<Record<number, readonly number[]>> = {
  30: [6, 16, 20, 24, 26],
  144: [5, 6, 7, 16, 19, 20, 21, 23, 24, 25, 26, 27, 37, 39],
}
/** The body's lower front, where its box meets the face's toe: mm from its centre. */
const LOWER_FRONT_AHEAD_MM = 430
const LOWER_FRONT_HEIGHT_MM = -380
/** A contact this deep at the lower front is a hit, not the steady cut's 5-7 mm graze. */
const TOE_HIT_MM = -10
/** The toe's rows: from just over the wheel line (the floor's jitter) to the lower front's top. */
const TOE_ROWS_M = [-0.43, -0.41, -0.39, -0.37, -0.35, -0.33, -0.31]
const BODY_HALF_M = 0.45
const TOE_SCAN_STEP_M = 0.0125
const TOE_SCAN_M = 1.2
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 1_200_000

/** One traced tick; `k` counts from the first tick the drive has let go. */
interface ReleaseTick {
  k: number
  tick: number
  commanded: number
  motor: number
  speed: number
  gate: 0 | 1 | null
  cutSpeed: number | null
  isDrilling: boolean
  isOnGround: boolean
  isStepLanded: boolean
  reachMm: number | null
  carry: number | null
  toeGapMm: number | null
  lowerFrontContactMm: number
}

type ReleaseKind = 'stopped' | 'bounce off the toe' | 'ramp runs out' | 'other'

interface Release {
  rig: string
  framesPerSecond: number
  phase: number
  isFollowed: boolean
  kind: ReleaseKind
  ticks: ReleaseTick[]
}

/** The live loop a release plays through. */
interface LivePlay {
  world: RAPIER.World
  body: RAPIER.RigidBody
  controller: VehicleController
  loop: ReturnType<typeof createVehicleLoop>
}

/** What one fixed tick of the live loop left. */
interface SteppedTick {
  result: VehicleStepResult
  read: CutFollow | undefined
  motor: Vector2
  before: Vector2
  contactMm: number
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

const ticksOf = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)

/** A fresh rig cuts level for `phase` ticks past 2.5 s, lets go, and is read tick by tick. */
function traceRelease(rig: string, framesPerSecond: number, phase: number): Release {
  const play = createPlay(RIGS[rig], framesPerSecond)
  play.hold(buildIntent(['aim_left']), ticksOf(2))
  play.hold(buildIntent(['aim_down']), ticksOf(3))
  const pressed = play.hold(buildIntent(['aim_left']), ticksOf(2.5) + phase)
  const release = play.hold(IDLE_INTENT, CUT_FOLLOW_TICKS + TICKS_TRACED_PAST_WINDOW)
  const ticks = numberedFromRelease([...pressed.slice(-PRESSED_TICKS_TRACED), ...release])
  const isFollowed = isFollowingCut(pressed.at(-1))
  return { rig, framesPerSecond, phase, isFollowed, kind: kindOfRelease(ticks), ticks }
}

/** The live loop with `levels` bought, held one render frame at a time. */
function createPlay(levels: Record<string, number>, framesPerSecond: number) {
  for (const [track, level] of Object.entries(levels)) {
    useGameStore.getState().setUpgrade(track, level)
  }
  const live = createLivePlay()
  const clock: FrameClock = { carried: 0 }
  let stepped = 0
  let commanded = 0
  const hold = (intent: VehicleIntent, count: number) => {
    const ticks: ReleaseTick[] = []
    const stepWorld = () => {
      if (stepped++ % 60 === 0) useGameStore.getState().setEnergy('150')
      const tick = stepTick(live, intent)
      commanded = commandedAfter(commanded, tick)
      ticks.push(releaseTickOf(tick, commanded, live.controller.planetPosition()))
    }
    while (ticks.length < count) {
      runFixedStepFrame(clock, 1 / framesPerSecond, { isHeld: () => false, stepWorld })
    }
    return ticks.slice(0, count)
  }
  return { hold }
}

function createLivePlay(): LivePlay {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  world.timestep = PHYSICS_TIMESTEP
  const start = readLocalVehicle().pose
  if (start === null) throw new Error('the starting planet has no dock')
  const { body, origin } = createVehicleBody(RAPIER, world, start)
  const controller = createVehicleController(RAPIER, world, { body, origin })
  return {
    world,
    body,
    controller,
    loop: createVehicleLoop({ ...DEV_FLAGS, 'drill.sweptCut': true }),
  }
}

/** One fixed tick: the motor's step, the velocity it set, the world's step and its contacts. */
function stepTick({ world, body, controller, loop }: LivePlay, intent: VehicleIntent): SteppedTick {
  const before = controller.planetPosition()
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
  const motor = vectorOf(body.linvel())
  watched.stepWorld()
  if (result === null) throw new Error('the loop has not stepped the body')
  const stepResult: VehicleStepResult = result
  const contactMm = lowerFrontContactMmOf(world, body, stepResult.pose)
  return { result: stepResult, read, motor, before, contactMm }
}

/** The drill's commanded speed, held through a shut gate and a cleared slab (`commandedSpeedsOf`). */
function commandedAfter(commanded: number, { result, read }: SteppedTick): number {
  const isCuttingGround = result.isCutting && read !== undefined && read.isSlabClear !== true
  return isCuttingGround && read.cutSpeed > 0 ? read.cutSpeed : commanded
}

function releaseTickOf(tick: SteppedTick, commanded: number, position: Vector2): ReleaseTick {
  const { result, read, motor, before } = tick
  const facing = unitFacingOf(result.pose)
  const up = unitUpOf(result.pose)
  const world = readAuthorityState().world
  const cursor = readLocalVehicle().sweptCut
  return {
    k: 0,
    tick: readAuthorityTick(),
    commanded: hundredthsOf(commanded),
    motor: hundredthsOf(along(motor, facing)),
    speed: hundredthsOf(along(minus(position, before), facing) / PHYSICS_TIMESTEP),
    gate: read?.gate.cutGate ?? null,
    cutSpeed: read === undefined ? null : hundredthsOf(read.cutSpeed),
    isDrilling: result.flags.isDrilling,
    isOnGround: isSolidAt(world, groundProbeOf(position, up)),
    isStepLanded: cursor?.tick === readAuthorityTick(),
    reachMm: cursor === undefined ? null : reachPastBodyMm(cursor, position, facing),
    carry: cursor?.carrySubSteps ?? null,
    toeGapMm: toeGapMmOf(world, position, facing, up),
    lowerFrontContactMm: tick.contactMm,
  }
}

/** The deepest contact the world's step left at the body's lower front, mm (0 with none). */
function lowerFrontContactMmOf(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  pose: VehiclePose,
): number {
  const own = body.collider(0)
  const centre = body.translation()
  const frame = { facing: unitFacingOf(pose), up: unitUpOf(pose) }
  let deepest = 0
  world.contactPairsWith(own, (other) => {
    world.contactPair(own, other, (manifold) => {
      for (let at = 0; at < manifold.numSolverContacts(); at++) {
        const offset = minus(manifold.solverContactPoint(at), centre)
        if (isAtLowerFront(offset, frame)) {
          deepest = Math.min(deepest, manifold.solverContactDist(at))
        }
      }
    })
  })
  return Math.round(deepest * MM_PER_METRE)
}

function isAtLowerFront(offset: Vector2, { facing, up }: { facing: Vector2; up: Vector2 }) {
  const aheadMm = along(offset, facing) * MM_PER_METRE
  const heightMm = along(offset, up) * MM_PER_METRE
  return aheadMm >= LOWER_FRONT_AHEAD_MM && heightMm <= LOWER_FRONT_HEIGHT_MM
}

/** The gap from the front to collider-solid ground over the toe's rows, mm (negative inside). */
function toeGapMmOf(
  world: WorldState,
  position: Vector2,
  facing: Vector2,
  up: Vector2,
): number | null {
  const gaps = TOE_ROWS_M.map((row) => solidPastFrontOf(world, { position, facing, up }, row))
  const found = gaps.filter((gap): gap is number => gap !== null)
  return found.length === 0 ? null : Math.round(Math.min(...found) * MM_PER_METRE)
}

/** How far past the body's front the first solid point on `row` lies, m; null with none. */
function solidPastFrontOf(
  world: WorldState,
  { position, facing, up }: { position: Vector2; facing: Vector2; up: Vector2 },
  row: number,
): number | null {
  for (let past = -0.1; past <= TOE_SCAN_M; past += TOE_SCAN_STEP_M) {
    const ahead = BODY_HALF_M + past
    const point = {
      x: position.x + facing.x * ahead + up.x * row,
      y: position.y + facing.y * ahead + up.y * row,
    }
    if (isSolidAt(world, point)) return past
  }
  return null
}

/** The pressed ticks before letting go count up to -1, the released ones from 0. */
function numberedFromRelease(ticks: readonly ReleaseTick[]): ReleaseTick[] {
  return ticks.map((tick, at) => ({ ...tick, k: at - PRESSED_TICKS_TRACED }))
}

/** The release sweep's rule (`isFollowingCut`): drilling, wheels down, at the commanded speed. */
function isFollowingCut(last: ReleaseTick | undefined): boolean {
  if (last === undefined || !last.isDrilling || !last.isOnGround) return false
  return Math.abs(last.speed - last.commanded) <= last.commanded * HELD_SHARE
}

function stopWindowOf(ticks: readonly ReleaseTick[]): ReleaseTick[] {
  return ticks.filter(({ k }) => k >= 0 && k < CUT_FOLLOW_TICKS)
}

function kindOfRelease(ticks: readonly ReleaseTick[]): ReleaseKind {
  const window = stopWindowOf(ticks)
  if (window.some(({ speed }) => Math.abs(speed) < STOPPED_MPS)) return 'stopped'
  const isBackward = window.some(({ speed }) => speed < BACKWARDS_M_PER_S)
  if (isBackward && toeHitOf(ticks) !== undefined) return 'bounce off the toe'
  if (window.filter(({ motor }) => motor > 0).length >= CUT_FOLLOW_TICKS - 1) return 'ramp runs out'
  return 'other'
}

/** The first let-go tick the motor still drove the lower front into ground. */
function toeHitOf(ticks: readonly ReleaseTick[]): ReleaseTick | undefined {
  return stopWindowOf(ticks).find(
    ({ motor, lowerFrontContactMm }) => motor > STOPPED_MPS && lowerFrontContactMm <= TOE_HIT_MM,
  )
}

function reachPastBodyMm(
  cursor: { xMm: number; yMm: number },
  position: Vector2,
  facing: Vector2,
): number {
  const reach = { x: cursor.xMm / MM_PER_METRE, y: cursor.yMm / MM_PER_METRE }
  return Math.round(along(minus(reach, position), facing) * MM_PER_METRE)
}

function isSolidAt(world: WorldState, { x, y }: Vector2): boolean {
  const params = planetParamsOf(readAuthorityState().planet)
  if (params === null) return false
  return groundReaderOf(world, params).densityAtPoint(x, y) >= ISO_DENSITY
}

function unitFacingOf(pose: VehiclePose): Vector2 {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return { x: facing.x / UP_VECTOR_SCALE, y: facing.y / UP_VECTOR_SCALE }
}

function unitUpOf(pose: VehiclePose): Vector2 {
  return { x: pose.upx / UP_VECTOR_SCALE, y: pose.upy / UP_VECTOR_SCALE }
}

function along(vector: Vector2, axis: Vector2): number {
  return vector.x * axis.x + vector.y * axis.y
}

function minus(a: Vector2, b: Vector2): Vector2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

function vectorOf({ x, y }: { x: number; y: number }): Vector2 {
  return { x, y }
}

function hundredthsOf(value: number): number {
  return Math.round(value * 100) / 100
}

/** Every rig at every frame rate, one release per phase a frame can land on. */
function traceAllReleases(): Release[] {
  return Object.keys(RIGS).flatMap((rig) =>
    FRAME_RATES.flatMap((framesPerSecond) =>
      phasesOf(framesPerSecond).map((phase) => {
        resetGameStore()
        return traceRelease(rig, framesPerSecond, phase)
      }),
    ),
  )
}

function phasesOf(framesPerSecond: number): number[] {
  const phaseStep = Math.max(1, Math.round(1 / (PHYSICS_TIMESTEP * framesPerSecond)))
  return Array.from({ length: Math.ceil(RELEASE_PHASES / phaseStep) }, (_, at) => at * phaseStep)
}

function sweepOf(releases: readonly Release[], rig: string, framesPerSecond: number): Release[] {
  return releases.filter((run) => run.rig === rig && run.framesPerSecond === framesPerSecond)
}

function phasesNamed(releases: readonly Release[], isNamed: (run: Release) => boolean): string {
  const phases = releases.filter(isNamed).map(({ phase }) => phase)
  return phases.length === 0 ? '-' : phases.join(',')
}

function stoppedShareOf(releases: readonly Release[]): string {
  return `${releases.filter((run) => run.kind === 'stopped').length}/${releases.length}`
}

/** Main's followed phases' backward ticks: count / deepest / sum, m/s. */
function backwardTicksOf(releases: readonly Release[]): string {
  const backward = releases
    .flatMap((run) => stopWindowOf(run.ticks).map(({ speed }) => speed))
    .filter((speed) => speed < BACKWARDS_M_PER_S)
  const sum = backward.reduce((total, speed) => total + speed, 0)
  return `${backward.length} / ${Math.min(0, ...backward).toFixed(2)} / ${sum.toFixed(2)}`
}

/** One row: the followed releases by kind, and the stop line on main's followed phases. */
function formatSweepRow(releases: readonly Release[], rig: string, framesPerSecond: number) {
  const sweep = sweepOf(releases, rig, framesPerSecond)
  const followed = sweep.filter((run) => run.isFollowed)
  const paired = sweep.filter((run) => MAIN_FOLLOWED_PHASES[framesPerSecond].includes(run.phase))
  return [
    rig,
    framesPerSecond,
    stoppedShareOf(followed),
    phasesNamed(followed, (run) => run.kind === 'bounce off the toe'),
    phasesNamed(followed, (run) => run.kind === 'ramp runs out'),
    phasesNamed(followed, (run) => run.kind === 'other'),
    phasesNamed(followed, (run) => run.kind === 'stopped' && toeHitOf(run.ticks) !== undefined),
    stoppedShareOf(paired),
    backwardTicksOf(paired),
  ].join(' | ')
}

function formatTable(releases: readonly Release[]): string {
  const header = [
    'rig | fps | followed stopped | bounce off the toe | ramp runs out | other',
    'toe hit, stopped | main-followed stopped | backward ticks / deepest / sum',
  ].join(' | ')
  const rows = Object.keys(RIGS).flatMap((rig) =>
    FRAME_RATES.map((framesPerSecond) => formatSweepRow(releases, rig, framesPerSecond)),
  )
  return [header, ...rows].join('\n')
}

function writeTrace(releases: readonly Release[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = releases.map((release) => JSON.stringify({ ticket: 458, ...release }))
  writeFileSync(new URL('level-release-trace.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

describe('level release phases, tick by tick (ticket 458)', () => {
  let releases: Release[] = []

  beforeAll(() => {
    releases = traceAllReleases()
    console.log(formatTable(releases))
    writeTrace(releases)
  }, RUN_TIMEOUT_MS)

  it('follows the level cut at some release phases on every rig and frame rate', () => {
    const sweeps = Object.keys(RIGS).flatMap((rig) =>
      FRAME_RATES.map((framesPerSecond) => sweepOf(releases, rig, framesPerSecond)),
    )
    expect(sweeps.filter((sweep) => !sweep.some((run) => run.isFollowed))).toEqual([])
  })

  it('traces a release phase alike at 30 and 144 frames/s', () => {
    for (const rig of Object.keys(RIGS)) {
      for (const slow of sweepOf(releases, rig, 30)) {
        const fast = sweepOf(releases, rig, 144).find(({ phase }) => phase === slow.phase)
        expect(fast?.ticks).toEqual(slow.ticks)
      }
    }
  })
})
