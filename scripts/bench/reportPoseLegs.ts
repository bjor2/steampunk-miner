/**
 * One timed leg of `benchReportPose.ts` (ticket 514): a rig cutting the probe's level line at a
 * steady speed, either reporting every `interval` ticks with that many drive and drill ticks, as the
 * live loop's reporter does, or (`swept`) stepping `drillAlongStep` every tick at the same stride.
 * The clock is moved untimed before each report, so the timed call is the report alone (its stamp,
 * gear, charge and yield); a tick with no report costs 0. Every report must be accepted: a
 * `CommandRejected` stops the bench. A leg too fast to stay under ground for its ticks is played as
 * passes from the same start state (states are values, so a pass leaves it as it was), each as long
 * as the cut, until it has timed its ticks.
 */
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../src/constants/physics'
import { advanceTicks } from '../../src/systems/authority/advanceTicks'
import { applyCommand } from '../../src/systems/authority/applyCommand'
import type { AuthorityCommand, CommandIntent } from '../../src/systems/authority/authorityCommand'
import { vehicleOf, type AuthorityState } from '../../src/systems/authority/authorityState'
import { drillAlongStep } from '../../src/systems/authority/drillStepCut'
import { PARAMS, poseAbove } from '../../src/systems/authority/scriptedSession'
import { NO_DRIVE } from '../../src/systems/vehicle/driveSigns'
import { FACING, noseTileOf, type VehiclePose } from '../../src/systems/vehicle/vehiclePose'
import { cellDensitySum } from '../../src/systems/world/cellYield'
import { CUT_LENGTH_MM, CUT_START, type BenchRig } from './reportPoseRigs'

export type Mode = 'report' | 'swept'

export interface Leg {
  rig: BenchRig
  width: number
  sideCells: number
  speedMps: number
  mode: Mode
  interval: number
}

/** One run's timings: each report's, each tick's (0 with no report), the reports and cells. */
export interface LegRun {
  reportMs: number[]
  tickMs: number[]
  reports: AuthorityCommand[]
  cellsPerTick: number[]
}

/** Rows within this many cells of the cut, besides the gear's side cells, are counted. */
const COUNT_REACH_CELLS = 4

/** A timed tick of the leg from `state`: the call alone, the clock moved untimed. */
type TimedTick = (state: AuthorityState, tick: number) => { state: AuthorityState; ms: number }

export function strideMmOf(speedMps: number): number {
  return Math.round((speedMps * MM_PER_METRE) / TICKS_PER_SECOND)
}

/** The ticks one pass along the cut lasts at the leg's speed, at most `ticks`. */
export function passTicksOf(speedMps: number, ticks: number): number {
  return Math.max(1, Math.min(ticks, Math.floor(CUT_LENGTH_MM / strideMmOf(speedMps))))
}

/** `ticks` ticks of the leg from `start`, in passes; `isCounted` counts the cells each changed. */
export function driveLeg(leg: Leg, start: AuthorityState, ticks: number, isCounted: boolean) {
  const passTicks = passTicksOf(leg.speedMps, ticks)
  const run: LegRun = { reportMs: [], tickMs: [], reports: [], cellsPerTick: [] }
  for (let timed = 0; timed < ticks; timed += passTicks) {
    drivePass(leg, start, Math.min(passTicks, ticks - timed), { run, isCounted })
  }
  return run
}

function drivePass(
  leg: Leg,
  start: AuthorityState,
  ticks: number,
  into: { run: LegRun; isCounted: boolean },
): void {
  const timedTick = leg.mode === 'swept' ? sweptTick(leg) : reportTick(leg)
  const { run } = into
  let state = start
  for (let tick = 1; tick <= ticks; tick++) {
    if (!isTickTimed(leg, tick)) {
      run.tickMs.push(0)
      continue
    }
    const timed = timedTick(state, tick)
    run.reportMs.push(timed.ms)
    run.tickMs.push(timed.ms)
    if (leg.mode === 'report') run.reports.push(sentReportOf(leg, timed.state, tick))
    if (into.isCounted) run.cellsPerTick.push(cellsChanged(state, timed.state, leg, tick))
    state = timed.state
  }
}

function isTickTimed(leg: Leg, tick: number): boolean {
  return leg.mode === 'swept' || tick % leg.interval === 0
}

function reportAt(leg: Leg, tick: number): CommandIntent<'reportPose'> {
  const vx = Math.round(leg.speedMps * MM_PER_METRE)
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.right, { drillTicks: leg.interval })
  return {
    type: 'reportPose',
    payload: {
      ...payload,
      ...{ x: CUT_START.x + strideMmOf(leg.speedMps) * tick, y: CUT_START.y, vx },
      ...{ driving: true, drilling: true, driveTicks: leg.interval },
      drive: { x: 1, y: 0 },
    },
  }
}

function reportTick(leg: Leg): TimedTick {
  return (state, tick) => {
    const advanced = advanceTicks(state, tick).state
    const seq = advanced.players.p1.lastSeq + 1
    const command = { playerId: 'p1', tick, seq, ...reportAt(leg, tick) }
    const started = performance.now()
    const outcome = applyCommand(advanced, command)
    const ms = performance.now() - started
    refuseRejection(outcome.events, tick)
    return { state: outcome.state, ms }
  }
}

function sweptTick(leg: Leg): TimedTick {
  const strideMm = strideMmOf(leg.speedMps)
  return (state, tick) => {
    const reported = vehicleOf(state, 'p1').pose as VehiclePose
    const pose = { ...reported, x: CUT_START.x + strideMm * tick }
    const step = { pose, drive: NO_DRIVE, isLifting: false }
    const started = performance.now()
    const effect = drillAlongStep({ ...state, tick }, PARAMS, 'p1', noseTileOf(pose), step)
    return { state: effect.state, ms: performance.now() - started }
  }
}

/** The report the tick sent, with the seq the state accepted, for the log's bytes. */
function sentReportOf(leg: Leg, state: AuthorityState, tick: number): AuthorityCommand {
  return { playerId: 'p1', tick, seq: state.players.p1.lastSeq, ...reportAt(leg, tick) }
}

function refuseRejection(events: readonly { type: string }[], tick: number): void {
  const rejected = events.find((event) => event.type === 'CommandRejected')
  if (rejected !== undefined) {
    throw new Error(`reportPose at tick ${tick} rejected: ${JSON.stringify(rejected)}`)
  }
}

/** Cells along the tick's stride, and round it, whose density the tick changed. */
function cellsChanged(before: AuthorityState, after: AuthorityState, leg: Leg, tick: number) {
  const strideMm = strideMmOf(leg.speedMps)
  const tx0 = Math.floor((CUT_START.x + strideMm * (tick - 1)) / MM_PER_METRE) - COUNT_REACH_CELLS
  const tx1 = Math.floor((CUT_START.x + strideMm * tick) / MM_PER_METRE) + COUNT_REACH_CELLS
  const ty0 = Math.floor(CUT_START.y / MM_PER_METRE)
  const rows = leg.sideCells + COUNT_REACH_CELLS
  let changed = 0
  for (let ty = ty0 - rows; ty <= ty0 + rows; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const tile = { tx, ty }
      const isChanged =
        cellDensitySum(before.world, PARAMS, tile) !== cellDensitySum(after.world, PARAMS, tile)
      if (isChanged) changed++
    }
  }
  return changed
}
