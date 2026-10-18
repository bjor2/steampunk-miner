/**
 * A pose report's own drilling and the heat it settles (decisions #7, #36, #113): the report's drill
 * ticks carve the stamp at its pose, unless the swept cut's steps already cut them (ticket 330), and
 * a burrower swimming in the nose tile is cut for the ticks the drill worked (#9). The heat gauge
 * then settles for the drilling the report did: when the steps cut it, the steps' summed dig time
 * (ticket 335), as the vehicle stood before the report; otherwise the report's own cut's.
 *
 * With the authority dev flag `drill.exactCarry` on (ticket 535, A6 "Option L"), the report's own
 * cut is counted on `LAW_WORK_CLOCK`: the same carve, charged on the density it removed at the
 * swept price with an integer carry, and its heat the same tally's whole drill ticks, read after
 * the cut from the vehicle's carry (`vehicle/cutCarry.ts`). Off, the report charges the ticks its
 * stamp removed something in and heats for its client-counted drill ticks, as protocol 84 did.
 *
 * A report at interval 1 whose bite runs on from the previous report cuts the capsule between the
 * two poses on the sub-step clock, its drill gear's cells cut on every tick (ticket 537,
 * `reportedCapsule.ts` picks the shape, the clock and the gear's cut under `drill.reportCapsule`,
 * only with the exact carry); the charge rule above is the same for either shape.
 *
 * With `heat.workUncapped` on as well (ticket 541) the gauge heats every whole drill tick of the
 * carry, however few ticks elapsed (`heatRules.ts`), and a report at the tick the gauge settled
 * heats nothing and leaves the carry whole for the next report, so no work is dropped.
 */
import { AUTHORITY_DEV_FLAGS, type AuthorityDevFlags } from '../../constants/devFlags'
import { splitCutHeatCarry } from '../vehicle/cutCarry'
import { stepDigTicksOf } from '../vehicle/sweptCut'
import type { VehiclePose } from '../vehicle/vehiclePose'
import { noseTileOf } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import type { CellsBesideCut } from '../world/groundEdit'
import type { StampPoint } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import type { AuthorityCommand, CommandPayloads } from './authorityCommand'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { unchanged, type RuleEffect } from './commandRule'
import { drillBurrowersOnTile } from './combat/enemyDamage'
import type { DomainEventBody } from './domainEvent'
import { drillAtPose, type DrillClock } from './groundDrill'
import { followHeat, type HeatActivity } from './heatRules'
import { planetParamsOf } from './planetOfState'
import { reportedCutShapeOf } from './reportedCapsule'
import { isCutBySteps } from './sweptDrill'

type PosePayload = CommandPayloads['reportPose']

/** The report's action ticks: thrust, drive and drill. */
export function actionTicksOf(payload: PosePayload): number[] {
  return [payload.thrustTicks, payload.driveTicks, payload.drillTicks]
}

/** A pose report as its own cut reads it: the vehicle before it, its tick and its payload. */
export interface PoseReport {
  before: VehicleState
  tick: number
  payload: PosePayload
}

/**
 * The report's drill ticks at its pose (`vehicle` carries the reported pose), unless the swept
 * cut's steps already cut them.
 */
export function drillReportedTicks(
  state: AuthorityState,
  playerId: string,
  vehicle: VehicleState,
  report: PoseReport,
  flags: AuthorityDevFlags = AUTHORITY_DEV_FLAGS,
): RuleEffect {
  if (isCutBySteps(vehicle) || vehicle.pose === null) return unchanged(state)
  return drillAtPoseAndBurrowers(state, playerId, reportedCutOf(vehicle.pose, report, flags))
}

/**
 * A report's own cut: its pose and payload, where its capsule starts, its clock, and when its
 * drill gear's cells are cut.
 */
interface PoseReportCut {
  pose: VehiclePose
  payload: PosePayload
  tail: StampPoint | null
  clock: DrillClock
  cellsBeside: CellsBesideCut
}

/** The capsule from the previous pose where the bite runs on (ticket 537), else the bare disc. */
function reportedCutOf(
  pose: VehiclePose,
  { before, tick, payload }: PoseReport,
  flags: AuthorityDevFlags,
): PoseReportCut {
  const shape = reportedCutShapeOf(
    { before, pose, isLifting: payload.thrusting, tick, drillTicks: payload.drillTicks },
    flags,
  )
  return { pose, payload, ...shape }
}

function drillAtPoseAndBurrowers(
  state: AuthorityState,
  playerId: string,
  { pose, payload, tail, clock, cellsBeside }: PoseReportCut,
): RuleEffect {
  const params = planetParamsOf(state.planet)
  if (params === null) return unchanged(state)
  const nose = noseTileOf(pose)
  const reported = { pose, drive: payload.drive, isLifting: payload.thrusting, tail, cellsBeside }
  const drilled = drillAtPose(state, params, playerId, reported, nose, payload.drillTicks, clock)
  return withBurrowersCut(drilled, playerId, nose)
}

/** A burrower swimming in the drilled tile is cut for the ticks the drill worked (#9). */
export function withBurrowersCut(
  drilled: RuleEffect,
  playerId: string,
  tile: TilePoint,
): RuleEffect {
  const ticks = drilledTicksOf(drilled.events)
  const cut = drillBurrowersOnTile(drilled.state, playerId, tile, ticks, drilled.state.tick)
  return { state: cut.state, events: [...drilled.events, ...cut.events] }
}

function drilledTicksOf(events: readonly DomainEventBody[]): number {
  return events.reduce(
    (ticks, event) => ticks + (event.type === 'DrillDamageDealt' ? event.ticks : 0),
    0,
  )
}

/**
 * Settles the heat gauge for the report's drilling, `before` being the vehicle before the report:
 * the steps' dig time when they cut it, else the cut's carry read after the cut (`state`), else
 * (`drill.exactCarry` off) the report's drill ticks.
 */
export function followReportedHeat(
  state: AuthorityState,
  { playerId, tick, payload }: AuthorityCommand<'reportPose'>,
  before: VehicleState,
  flags: AuthorityDevFlags = AUTHORITY_DEV_FLAGS,
): RuleEffect {
  if (isCarriedHeatReport(before, flags)) {
    return followCarriedHeat(state, playerId, tick, isIdleReport(payload), flags)
  }
  return followHeat(state, playerId, tick, reportedHeatActivity(payload, before), flags)
}

function isCarriedHeatReport(before: VehicleState, flags: AuthorityDevFlags): boolean {
  return flags['drill.exactCarry'] && !isCutBySteps(before)
}

/** The carry's whole drill ticks heat; the part of a tick left over stays on the vehicle. */
function followCarriedHeat(
  state: AuthorityState,
  playerId: string,
  tick: number,
  isIdle: boolean,
  flags: AuthorityDevFlags,
): RuleEffect {
  if (isHeatHeldOnCarry(vehicleOf(state, playerId), tick, flags)) {
    return followHeat(state, playerId, tick, { drillTicks: 0, isIdle }, flags)
  }
  const { heatTicks, vehicle } = splitCutHeatCarry(vehicleOf(state, playerId))
  const carried = withVehicle(state, playerId, vehicle)
  return followHeat(carried, playerId, tick, { drillTicks: heatTicks, isIdle }, flags)
}

/**
 * Whether the carry keeps its whole drill ticks for the next report: with `heat.workUncapped` on, a
 * report at the tick the gauge settled has no tick to heat them over (the TD seam 6232743242).
 */
function isHeatHeldOnCarry(vehicle: VehicleState, tick: number, flags: AuthorityDevFlags): boolean {
  return flags['heat.workUncapped'] && tick <= vehicle.heat.settledTick
}

/** A report with no action ticks at all is the vehicle stopped to cool down (#113 "idle"). */
function reportedHeatActivity(payload: PosePayload, vehicle: VehicleState): HeatActivity {
  return {
    drillTicks: reportedDrillTicksOf(payload, vehicle),
    isIdle: isIdleReport(payload),
  }
}

function isIdleReport(payload: PosePayload): boolean {
  return actionTicksOf(payload).every((ticks) => ticks === 0)
}

function reportedDrillTicksOf(payload: PosePayload, vehicle: VehicleState): number {
  const cursor = vehicle.sweptCut
  return isCutBySteps(vehicle) && cursor !== undefined ? stepDigTicksOf(cursor) : payload.drillTicks
}
