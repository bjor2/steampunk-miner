/**
 * One pass of a `bench:purchase-levels` rig down its column (ticket 840), tick by tick as the live
 * client drives it with `drill.sweptCut` on (`scene/vehicleLoop.ts`): the cut-follow says how far
 * the cut's front steps this tick (`frontStepMmAt`, ticket 570), the body moves that far, then the
 * authority's tick runs: the clock moved, a `drillStep` at the body, a report every 12 ticks moving
 * at the body's speed. The rig starts already moving down at its law's cut speed, as the ladder and
 * the #560 slab rigs do, so a row reads its speed at steady state, not the gravity ramp (#724).
 * The tank is refilled each tick outside the timed part. A pass stops at the core's top, after
 * `DRIVE_TICKS`, or once the cut has stood still `STALL_TICKS`.
 */
import { performance } from 'node:perf_hooks'
import { POSE_REPORT_INTERVAL_TICKS } from '../../src/constants/balance'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../src/constants/physics'
import { vehicleOf } from '../../src/systems/authority/authorityState'
import type { CommandIntent } from '../../src/systems/authority/authorityCommand'
import { frontStepMmAt } from '../../src/systems/authority/cutFollowRead'
import { poseAbove } from '../../src/systems/authority/scriptedSession'
import { movingDownAt } from '../../src/systems/authority/sweptRigFixtures'
import type { DriveSigns } from '../../src/systems/vehicle/driveSigns'
import type { Vector2 } from '../../src/systems/vehicle/localFrame'
import { FACING } from '../../src/systems/vehicle/vehiclePose'
import {
  armedSession,
  energyRefillOf,
  refusalsOf,
  RIG_PLAYER,
  type ArmedSession,
  type RowRig,
} from './purchaseLevelRows'

/** Three seconds of ticks: a pass's longest. */
const DRIVE_TICKS = 3 * TICKS_PER_SECOND
const STALL_TICKS = TICKS_PER_SECOND
/** The body stops this many cells above the core's top. */
const CORE_CLEARANCE_TILES = 4
const DOWN: DriveSigns = { x: 0, y: -1 }

export interface DrivePass {
  armed: ArmedSession
  tick: number
  /** The body, mm from the planet's centre. */
  body: { x: number; y: number }
  stopYMm: number
  stillTicks: number
}

/** What one tick of the pass cost and did. */
export interface DriveTick {
  /** The client's cut-follow read, ms. */
  followMs: number
  /** The authority's tick: the clock, the `drillStep` and any report, ms. */
  tickMs: number
  movedMm: number
  refusals: string[]
}

export function startDrivePass(rig: RowRig): DrivePass {
  const armed = armedSession(rig.planet, rig.drillPower)
  const stopYMm = (armed.params.coreRadiusTiles + CORE_CLEARANCE_TILES) * MM_PER_METRE
  const pass = { armed, tick: 0, body: { ...armed.start }, stopYMm, stillTicks: 0 }
  const moving = reportAt(pass, rig.lawStepMm * TICKS_PER_SECOND, 0)
  const refusals = refusalsOf(armed.session.submit(0, moving, RIG_PLAYER))
  if (refusals.length > 0) throw new Error(`the moving start was refused: ${refusals.join('; ')}`)
  return pass
}

export function isDrivePassOver(pass: DrivePass): boolean {
  return pass.body.y <= pass.stopYMm || pass.tick >= DRIVE_TICKS || pass.stillTicks >= STALL_TICKS
}

export function stepDrivePass(pass: DrivePass): DriveTick {
  pass.tick++
  const started = performance.now()
  const strideMm = frontStepMmAt(pass.armed.session.state(), RIG_PLAYER, followStepOf(pass))
  const followMs = performance.now() - started
  const movedMm = moveBody(pass, strideMm)
  const { tickMs, refusals } = runAuthorityTick(pass, movedMm)
  return { followMs, tickMs, movedMm, refusals }
}

/** The body, metres from the planet's centre. */
export function bodyMetresOf(pass: DrivePass): Vector2 {
  return { x: pass.body.x / MM_PER_METRE, y: pass.body.y / MM_PER_METRE }
}

/** Where the cut has reached, metres: the swept cursor's stamp, or the body before any cut. */
export function cutFrontMetresOf(pass: DrivePass): Vector2 {
  const cursor = vehicleOf(pass.armed.session.state(), RIG_PLAYER).sweptCut
  if (cursor === undefined) return bodyMetresOf(pass)
  return { x: cursor.xMm / MM_PER_METRE, y: cursor.yMm / MM_PER_METRE }
}

function followStepOf(pass: DrivePass) {
  return { ...pass.body, facing: FACING.down, isLifting: false, isDrilling: true }
}

/** The body one front step down, never past the core's top; answers how far it went. */
function moveBody(pass: DrivePass, strideMm: number): number {
  const before = pass.body.y
  pass.body.y = Math.max(pass.stopYMm, before - strideMm)
  const movedMm = before - pass.body.y
  pass.stillTicks = movedMm > 0 ? 0 : pass.stillTicks + 1
  return movedMm
}

/** The authority's tick, timed without the untimed tank refill between the clock and the step. */
function runAuthorityTick(pass: DrivePass, movedMm: number) {
  const { session } = pass.armed
  const clockMs = timedSubmit(() => session.advanceTo(pass.tick))
  session.submit(pass.tick, energyRefillOf(session), RIG_PLAYER)
  const refusals: string[] = []
  const stepMs = timedSubmit(() => refusals.push(...refusalsOf(submitStep(pass, movedMm))))
  return { tickMs: clockMs + stepMs, refusals }
}

function timedSubmit(run: () => unknown): number {
  const started = performance.now()
  run()
  return performance.now() - started
}

/** The tick's `drillStep`, and its report when one is due. */
function submitStep(pass: DrivePass, movedMm: number) {
  const { session } = pass.armed
  const events = session.submit(pass.tick, drillStepAt(pass), RIG_PLAYER)
  if (pass.tick % POSE_REPORT_INTERVAL_TICKS !== 0) return events
  const speedMmPerSecond = movedMm * TICKS_PER_SECOND
  const report = reportAt(pass, speedMmPerSecond, POSE_REPORT_INTERVAL_TICKS)
  return [...events, ...session.submit(pass.tick, report, RIG_PLAYER)]
}

function drillStepAt(pass: DrivePass): CommandIntent<'drillStep'> {
  return { type: 'drillStep', payload: { ...pass.body, facing: FACING.down, drive: DOWN } }
}

/** A report at the body moving down at `mmPerSecond`, its `ticks` all driving and drilling. */
function reportAt(
  pass: DrivePass,
  mmPerSecond: number,
  ticks: number,
): CommandIntent<'reportPose'> {
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
  const counts = { driveTicks: ticks, drillTicks: ticks, driving: ticks > 0, drilling: ticks > 0 }
  const moving = movingDownAt(payload, mmPerSecond)
  return {
    type: 'reportPose',
    payload: { ...payload, ...pass.body, ...moving, ...counts, drive: DOWN },
  }
}
