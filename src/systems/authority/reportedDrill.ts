/**
 * A pose report's own drilling and the heat it settles (decisions #7, #36, #113): the report's drill
 * ticks carve the stamp at its pose, unless the swept cut's steps already cut them (ticket 330), and
 * a burrower swimming in the nose tile is cut for the ticks the drill worked (#9). The heat gauge
 * then settles for the drilling the report did: its own drill ticks, or, when the steps cut them,
 * the steps' summed dig time (ticket 335), as the vehicle stood before the report.
 */
import { stepDigTicksOf } from '../vehicle/sweptCut'
import type { VehiclePose } from '../vehicle/vehiclePose'
import { noseTileOf } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import type { AuthorityCommand, CommandPayloads } from './authorityCommand'
import type { AuthorityState } from './authorityState'
import { unchanged, type RuleEffect } from './commandRule'
import { drillBurrowersOnTile } from './combat/enemyDamage'
import type { DomainEventBody } from './domainEvent'
import { drillAtPose } from './groundDrill'
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
): RuleEffect {
  if (isCutBySteps(vehicle) || vehicle.pose === null) return unchanged(state)
  return drillAtPoseAndBurrowers(state, playerId, vehicle.pose, payload)
}

function drillAtPoseAndBurrowers(
  state: AuthorityState,
  playerId: string,
  pose: VehiclePose,
  payload: PosePayload,
): RuleEffect {
  const params = planetParamsOf(state.planet)
  if (params === null) return unchanged(state)
  const nose = noseTileOf(pose)
  const reported = { pose, drive: payload.drive, isLifting: payload.thrusting }
  const drilled = drillAtPose(state, params, playerId, reported, nose, payload.drillTicks)
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

/** Settles the heat gauge for the report's drilling, `before` being the vehicle before the report. */
export function followReportedHeat(
  state: AuthorityState,
  { playerId, tick, payload }: AuthorityCommand<'reportPose'>,
  before: VehicleState,
): RuleEffect {
  return followHeat(state, playerId, tick, reportedHeatActivity(payload, before))
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
