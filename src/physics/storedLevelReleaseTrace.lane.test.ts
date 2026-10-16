import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
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

// Stored-rig level release phases, tick by tick (ticket 465, measurement only, from #459's
// `cutFollowRelease` todos): the release sweep of `cutFollowRelease.test.ts` (off the pad, down,
// level west for 2.5 s plus a phase, then let go) for the stored 10 and stored 20 rigs at 30 and
// 144 frames/s with `drill.sweptCut` on. Each traced tick records the commanded cut speed, the
// speed the motor set along the facing and along up, the body's speed over the tick along both,
// the gate and the carry, and the deepest contact the world's step left anywhere on the body: its
// depth, the push it gives the body in the body's frame (along the facing, along up), where on the
// body it sits, and which wall that makes it (floor, face, corner). Each followed release is named:
// stopped within 6 ticks, backed off (pushed back past the stop line on every window tick) or ran
// on. A window tick the motor holds at 0 and the body still moves back past the stop line counts
// as slid back, and as a gravity slide when its speed is what the floor's tilt predicts: the
// contact has no friction, so the solver keeps only the part of the tick's gravity along the
// floor's tangent. A lane: it runs only when named, prints the table and writes the trace to
// balance-report/stored-level-release-trace.ndjson, so the fix ticket can re-run it once #459's
// post-cut halo sync is in.

const RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 10': { drill_power: 10, drill_tip: 0 },
  'stored 20': { drill_power: 20, drill_tip: 0 },
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
/** A push this close to one body axis names the wall it comes from; between them, a corner. */
const WALL_AXIS_SHARE = 0.9
/** A slid-back tick's speed within this of the gravity slide its floor predicts counts as that. */
const SLIDE_MATCH_MPS = 0.03
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 1_200_000

type Wall = 'floor' | 'face' | 'back' | 'roof' | 'corner' | 'none'

/** The deepest contact of a tick, in the body's frame (facing, up), mm and unit push. */
interface DeepestContact {
  depthMm: number
  pushAlong: number
  pushUp: number
  aheadMm: number
  heightMm: number
  wall: Wall
}

/** One traced tick; `k` counts from the first tick the drive has let go. */
interface ReleaseTick {
  k: number
  tick: number
  commanded: number
  motor: number
  motorUp: number
  speed: number
  speedUp: number
  gate: 0 | 1 | null
  isDrilling: boolean
  isOnGround: boolean
  carry: number | null
  contact: DeepestContact
}

type ReleaseKind = 'stopped' | 'backed off' | 'ran on'

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
  contact: DeepestContact
}

/** The body's frame: unit facing and up. */
interface BodyFrame {
  facing: Vector2
  up: Vector2
}

const NO_CONTACT: DeepestContact = {
  depthMm: 0,
  pushAlong: 0,
  pushUp: 0,
  aheadMm: 0,
  heightMm: 0,
  wall: 'none',
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
  return { world, body, controller, loop: createVehicleLoop({ 'drill.sweptCut': true }) }
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
  const contact = deepestContactOf(world, body, frameOf(stepResult.pose))
  return { result: stepResult, read, motor, before, contact }
}

/** The drill's commanded speed, held through a shut gate and a cleared slab (`commandedSpeedsOf`). */
function commandedAfter(commanded: number, { result, read }: SteppedTick): number {
  const isCuttingGround = result.isCutting && read !== undefined && read.isSlabClear !== true
  return isCuttingGround && read.cutSpeed > 0 ? read.cutSpeed : commanded
}

function releaseTickOf(tick: SteppedTick, commanded: number, position: Vector2): ReleaseTick {
  const { result, read, motor, before } = tick
  const { facing, up } = frameOf(result.pose)
  const moved = minus(position, before)
  const cursor = readLocalVehicle().sweptCut
  return {
    k: 0,
    tick: readAuthorityTick(),
    commanded: hundredthsOf(commanded),
    motor: hundredthsOf(along(motor, facing)),
    motorUp: hundredthsOf(along(motor, up)),
    speed: hundredthsOf(along(moved, facing) / PHYSICS_TIMESTEP),
    speedUp: hundredthsOf(along(moved, up) / PHYSICS_TIMESTEP),
    gate: read?.gate.cutGate ?? null,
    isDrilling: result.flags.isDrilling,
    isOnGround: isSolidAt(readAuthorityState().world, groundProbeOf(position, up)),
    carry: cursor?.carrySubSteps ?? null,
    contact: tick.contact,
  }
}

/** The deepest contact the world's step left on the body, read in the body's frame. */
function deepestContactOf(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  frame: BodyFrame,
): DeepestContact {
  const own = body.collider(0)
  const centre = vectorOf(body.translation())
  let deepest = NO_CONTACT
  world.contactPairsWith(own, (other) => {
    world.contactPair(own, other, (manifold) => {
      const normal = vectorOf(manifold.normal())
      for (let at = 0; at < manifold.numSolverContacts(); at++) {
        const point = vectorOf(manifold.solverContactPoint(at))
        const depthMm = Math.round(manifold.solverContactDist(at) * MM_PER_METRE)
        if (depthMm < deepest.depthMm) {
          deepest = contactInFrame(depthMm, pushOnBody(normal, minus(centre, point)), {
            offset: minus(point, centre),
            frame,
          })
        }
      }
    })
  })
  return deepest
}

/** The manifold's normal, turned to push the body away from the ground (toward its centre). */
function pushOnBody(normal: Vector2, towardCentre: Vector2): Vector2 {
  return along(normal, towardCentre) >= 0 ? normal : { x: -normal.x, y: -normal.y }
}

function contactInFrame(
  depthMm: number,
  push: Vector2,
  { offset, frame }: { offset: Vector2; frame: BodyFrame },
): DeepestContact {
  const pushAlong = hundredthsOf(along(push, frame.facing))
  const pushUp = hundredthsOf(along(push, frame.up))
  return {
    depthMm,
    pushAlong,
    pushUp,
    aheadMm: Math.round(along(offset, frame.facing) * MM_PER_METRE),
    heightMm: Math.round(along(offset, frame.up) * MM_PER_METRE),
    wall: wallOf(pushAlong, pushUp),
  }
}

/** The wall a push comes from: the floor pushes up, the face back, the back wall on, a corner both. */
function wallOf(pushAlong: number, pushUp: number): Wall {
  if (pushUp >= WALL_AXIS_SHARE) return 'floor'
  if (pushUp <= -WALL_AXIS_SHARE) return 'roof'
  if (pushAlong <= -WALL_AXIS_SHARE) return 'face'
  if (pushAlong >= WALL_AXIS_SHARE) return 'back'
  return 'corner'
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
  return window.some(({ speed }) => speed < BACKWARDS_M_PER_S) ? 'backed off' : 'ran on'
}

function isSolidAt(world: WorldState, { x, y }: Vector2): boolean {
  const params = planetParamsOf(readAuthorityState().planet)
  if (params === null) return false
  return groundReaderOf(world, params).densityAtPoint(x, y) >= ISO_DENSITY
}

function frameOf(pose: VehiclePose): BodyFrame {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return {
    facing: { x: facing.x / UP_VECTOR_SCALE, y: facing.y / UP_VECTOR_SCALE },
    up: { x: pose.upx / UP_VECTOR_SCALE, y: pose.upy / UP_VECTOR_SCALE },
  }
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

function phasesNamed(releases: readonly Release[], kind: ReleaseKind): string {
  const phases = releases.filter((run) => run.kind === kind).map(({ phase }) => phase)
  return phases.length === 0 ? '-' : phases.join(',')
}

/** The walls the deepest contacts of a sweep's last pressed and window ticks came from. */
function wallsOf(releases: readonly Release[]): string {
  const counts = new Map<Wall, number>()
  for (const tick of releases.flatMap((run) => run.ticks.filter(({ k }) => k < CUT_FOLLOW_TICKS))) {
    counts.set(tick.contact.wall, (counts.get(tick.contact.wall) ?? 0) + 1)
  }
  return [...counts].map(([wall, count]) => `${wall} ${count}`).join(', ')
}

/** The deepest contact over a sweep's traced ticks before the window closes, mm. */
function deepestMmOf(releases: readonly Release[]): number {
  const ticks = releases.flatMap((run) => run.ticks.filter(({ k }) => k < CUT_FOLLOW_TICKS))
  return Math.min(0, ...ticks.map(({ contact }) => contact.depthMm))
}

/**
 * The along-facing speed the solver leaves a tick whose motor set none: with no friction it takes
 * out only the velocity into the floor, `(v . n) n`, so the gravity the motor added slides the
 * body along the floor's tangent by `-(motorUp * pushUp) * pushAlong`.
 */
function gravitySlideOf({ motorUp, contact }: ReleaseTick): number {
  return contact.wall === 'none' ? 0 : -(motorUp * contact.pushUp) * contact.pushAlong
}

/** Window ticks the motor held at 0 that slid back past the stop line, and how many by gravity. */
function slidBackOf(releases: readonly Release[]): string {
  const slid = releases
    .flatMap((run) => stopWindowOf(run.ticks))
    .filter(({ motor, speed }) => motor === 0 && speed <= -STOPPED_MPS)
  const byGravity = slid.filter(
    (tick) => Math.abs(tick.speed - gravitySlideOf(tick)) <= SLIDE_MATCH_MPS,
  )
  return `${slid.length} / ${byGravity.length}`
}

/** One row: the followed releases by kind, and the walls the body pressed into. */
function formatSweepRow(releases: readonly Release[], rig: string, framesPerSecond: number) {
  const followed = sweepOf(releases, rig, framesPerSecond).filter((run) => run.isFollowed)
  const stopped = followed.filter((run) => run.kind === 'stopped').length
  return [
    rig,
    framesPerSecond,
    `${stopped}/${followed.length}`,
    phasesNamed(followed, 'backed off'),
    phasesNamed(followed, 'ran on'),
    deepestMmOf(followed),
    wallsOf(followed),
    slidBackOf(followed),
  ].join(' | ')
}

function formatTable(releases: readonly Release[]): string {
  const header = [
    'rig | fps | followed stopped | backed off | ran on | deepest contact mm | deepest walls',
    'slid back / by gravity on a tilted floor',
  ].join(' | ')
  const rows = Object.keys(RIGS).flatMap((rig) =>
    FRAME_RATES.map((framesPerSecond) => formatSweepRow(releases, rig, framesPerSecond)),
  )
  return [header, ...rows].join('\n')
}

function writeTrace(releases: readonly Release[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = releases.map((release) => JSON.stringify({ ticket: 465, ...release }))
  writeFileSync(
    new URL('stored-level-release-trace.ndjson', REPORT_FOLDER),
    `${lines.join('\n')}\n`,
  )
}

describe('stored-rig level release phases, tick by tick (ticket 465)', () => {
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
