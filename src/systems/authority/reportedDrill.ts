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
 */
import { AUTHORITY_DEV_FLAGS, type AuthorityDevFlags } from '../../constants/devFlags'
import { splitCutHeatCarry } from '../vehicle/cutCarry'
import { stepDigTicksOf } from '../vehicle/sweptCut'
import type { VehiclePose } from '../vehicle/vehiclePose'
import { noseTileOf } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import type { AuthorityCommand, CommandPayloads } from './authorityCommand'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { unchanged, type RuleEffect } from './commandRule'
import { drillBurrowersOnTile } from './combat/enemyDamage'
import type { DomainEventBody } from './domainEvent'
import { drillAtPose, LAW_WORK_CLOCK, WHOLE_TICK_CLOCK, type DrillClock } from './groundDrill'
import { followHeat, type HeatActivity } from './heatRules'
import { planetParamsOf } from './planetOfState'
import { isCutBySteps } from './sweptDrill'

type PosePayload = CommandPayloads['reportPose']

/** The report's action ticks: thrust, drive and drill. */
export function actionTicksOf(payload: PosePayload): number[] {
  return [payload.thrustTicks, payload.driveTicks, payload.drillTicks]
}

/** The report's drill ticks at its pose, unless the swept cut's steps already cut them. */
export function drillReportedTicks(
  state: AuthorityState,
  playerId: string,
  vehicle: VehicleState,
  payload: PosePayload,
  flags: AuthorityDevFlags = AUTHORITY_DEV_FLAGS,
): RuleEffect {
  if (isCutBySteps(vehicle) || vehicle.pose === null) return unchanged(state)
  return drillAtPoseAndBurrowers(state, playerId, { pose: vehicle.pose, payload }, clockOf(flags))
}

/** The clock the report's own cut is charged on: the law work it removed, or whole ticks. */
function clockOf(flags: AuthorityDevFlags): DrillClock {
  return flags['drill.exactCarry'] ? LAW_WORK_CLOCK : WHOLE_TICK_CLOCK
}

/** A report's pose and payload, as its own cut reads them. */
interface PoseReportCut {
  pose: VehiclePose
  payload: PosePayload
}

function drillAtPoseAndBurrowers(
  state: AuthorityState,
  playerId: string,
  { pose, payload }: PoseReportCut,
  clock: DrillClock,
): RuleEffect {
  const params = planetParamsOf(state.planet)
  if (params === null) return unchanged(state)
  const nose = noseTileOf(pose)
  const reported = { pose, drive: payload.drive, isLifting: payload.thrusting }
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
    return followCarriedHeat(state, playerId, tick, isIdleReport(payload))
  }
  return followHeat(state, playerId, tick, reportedHeatActivity(payload, before))
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
): RuleEffect {
  const { heatTicks, vehicle } = splitCutHeatCarry(vehicleOf(state, playerId))
  const carried = withVehicle(state, playerId, vehicle)
  return followHeat(carried, playerId, tick, { drillTicks: heatTicks, isIdle })
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
