/**
 * The vehicle's play commands (decisions #7, #3, #11 amendments):
 *
 * - `reportPose`: the client-owned pose at 5 Hz plus the fixed steps each action was active since
 *   the last report; the authority charges energy as count times rate (drill 4, thrust 6, drive 1
 *   quanta) and drills the tile at the nose for the drill ticks. A stranded or destroyed vehicle
 *   still reports its pose (gravity and hits apply) but its action ticks are ignored.
 * - `drillTile`: scripted mining of one tile within reach, the same drilling path.
 * - `requestRescue`: calls the tow for a stranded or destroyed vehicle.
 *
 * Action tick counts may not exceed the ticks since the last charged command plus one report
 * interval of slack; more is refused (never trimmed), so a tap is charged exactly once.
 */
import { POSE_REPORT_INTERVAL_TICKS } from '../../constants/balance'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import {
  isFacing,
  isWithinDrillReach,
  noseTileOf,
  poseProblems,
  type Facing,
  type VehiclePose,
} from '../vehicle/vehiclePose'
import { isVehicleActive, type VehicleState } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import { isRemovableCell } from '../world/worldCell'
import { cellAt } from '../world/worldState'
import type { AuthorityCommand, CommandPayloads } from './authorityCommand'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import {
  chainEffects,
  firstRejection,
  rejectionOf,
  unchanged,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import { drillBurrowersOnTile } from './combat/enemyDamage'
import { noteReportForCombat } from './combat/poseReportCombat'
import { drillOnTile } from './drillOnTile'
import type { DomainEventBody } from './domainEvent'
import { noPlanetRejection, planetParamsOf } from './planetOfState'
import { followEnergyChange, rescueCauseOf, towVehicle } from './vehicleTransitions'

type PosePayload = CommandPayloads['reportPose']

export const VEHICLE_COMMAND_RULES: {
  readonly reportPose: CommandRule<'reportPose'>
  readonly drillTile: CommandRule<'drillTile'>
  readonly requestRescue: CommandRule<'requestRescue'>
} = {
  reportPose: {
    fields: {
      x: 'safeInteger',
      y: 'safeInteger',
      vx: 'safeInteger',
      vy: 'safeInteger',
      upx: 'safeInteger',
      upy: 'safeInteger',
      facing: 'wholeNumber',
      driving: 'flag',
      thrusting: 'flag',
      drilling: 'flag',
      thrustTicks: 'wholeNumber',
      driveTicks: 'wholeNumber',
      drillTicks: 'wholeNumber',
    },
    reject: (state, command) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => poseRejection(command.payload),
        () => tickBudgetRejection(state, command, actionTicksOf(command.payload)),
      ]),
    apply: (state, command) =>
      chainEffects(state, [
        (current) => recordPose(current, command),
        (current) => noteReportForCombat(current, command.playerId, command.tick),
        (current) => chargeReportedActions(current, command),
        (current) => followEnergyChange(current, command.playerId, command.tick),
      ]),
  },
  drillTile: {
    fields: { tx: 'safeInteger', ty: 'safeInteger', ticks: 'wholeNumber' },
    reject: (state, command) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => activeVehicleRejection(vehicleOf(state, command.playerId)),
        () => reachRejection(state, command),
        () => drillableRejection(state, command),
        () => tickBudgetRejection(state, command, [command.payload.ticks]),
      ]),
    apply: (state, command) =>
      chainEffects(state, [
        (current) => drillScriptedTile(current, command),
        (current) => markCharged(current, command.playerId, command.tick),
        (current) => followEnergyChange(current, command.playerId, command.tick),
      ]),
  },
  requestRescue: {
    fields: {},
    reject: (state, command) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => rescueRejection(vehicleOf(state, command.playerId)),
      ]),
    apply: (state, { playerId, tick }) => {
      const cause = rescueCauseOf(vehicleOf(state, playerId))
      return cause === null ? unchanged(state) : towVehicle(state, playerId, cause, tick)
    },
  },
}

function poseRejection(payload: PosePayload): Rejection | null {
  const problems = poseProblems(poseOf(payload))
  return problems.length > 0 ? { reason: 'invalid_pose', problems } : null
}

function activeVehicleRejection(vehicle: VehicleState): Rejection | null {
  if (isVehicleActive(vehicle)) return null
  return rejectionOf('vehicle_not_active', `the vehicle is ${vehicle.mode}`)
}

function rescueRejection(vehicle: VehicleState): Rejection | null {
  if (rescueCauseOf(vehicle) !== null) return null
  return rejectionOf('no_rescue_needed', `the vehicle is ${vehicle.mode}`)
}

function reachRejection(state: AuthorityState, command: AuthorityCommand<'drillTile'>) {
  const { pose } = vehicleOf(state, command.playerId)
  const { tx, ty } = command.payload
  if (pose !== null && isWithinDrillReach(pose, { tx, ty })) return null
  return rejectionOf('out_of_reach', `tile ${tx},${ty} is out of the drill's reach`)
}

function drillableRejection(state: AuthorityState, command: AuthorityCommand<'drillTile'>) {
  const params = planetParamsOf(state.planet)
  const { tx, ty } = command.payload
  if (params !== null && isRemovableCell(cellAt(state.world, params, { tx, ty }))) return null
  return rejectionOf('not_drillable', `tile ${tx},${ty} is air or the dock pad`)
}

/** Each action's ticks fit in the time since the last charged command, plus one interval. */
function tickBudgetRejection(
  state: AuthorityState,
  command: AuthorityCommand,
  actionTicks: readonly number[],
): Rejection | null {
  const { accountedTick } = vehicleOf(state, command.playerId)
  const budget = command.tick - accountedTick + POSE_REPORT_INTERVAL_TICKS
  if (actionTicks.every((ticks) => ticks <= budget)) return null
  return rejectionOf('too_many_ticks', `action ticks must be at most ${budget}`)
}

function actionTicksOf(payload: PosePayload): number[] {
  return [payload.thrustTicks, payload.driveTicks, payload.drillTicks]
}

function poseOf(payload: PosePayload): VehiclePose {
  const { x, y, vx, vy, upx, upy, facing } = payload
  return { x, y, vx, vy, upx, upy, facing: (isFacing(facing) ? facing : -1) as Facing }
}

function recordPose(state: AuthorityState, command: AuthorityCommand<'reportPose'>): RuleEffect {
  const vehicle = vehicleOf(state, command.playerId)
  return unchanged(
    withVehicle(state, command.playerId, { ...vehicle, pose: poseOf(command.payload) }),
  )
}

/** Drill at the nose first, then thrust, then drive, each only as far as the tank allows. */
function chargeReportedActions(
  state: AuthorityState,
  command: AuthorityCommand<'reportPose'>,
): RuleEffect {
  const { playerId, payload, tick } = command
  const vehicle = vehicleOf(state, playerId)
  const params = planetParamsOf(state.planet)
  if (!isVehicleActive(vehicle) || params === null || vehicle.pose === null) {
    return unchanged(markChargedState(state, playerId, tick))
  }
  const drilled = drillTileAndBurrowers(
    state,
    playerId,
    noseTileOf(vehicle.pose),
    payload.drillTicks,
  )
  const moved = chargeMovement(drilled.state, playerId, payload)
  return { state: markChargedState(moved, playerId, tick), events: drilled.events }
}

function chargeMovement(state: AuthorityState, playerId: string, payload: PosePayload) {
  const vehicle = vehicleOf(state, playerId)
  const cost =
    payload.thrustTicks * ENERGY_QUANTA_PER_TICK.thrust +
    payload.driveTicks * ENERGY_QUANTA_PER_TICK.drive
  return withVehicle(state, playerId, { ...vehicle, energy: Math.max(0, vehicle.energy - cost) })
}

function drillScriptedTile(state: AuthorityState, command: AuthorityCommand<'drillTile'>) {
  const { tx, ty, ticks } = command.payload
  return drillTileAndBurrowers(state, command.playerId, { tx, ty }, ticks)
}

/** The drill cuts the tile, and a burrower swimming in it for the ticks it cut (#9). */
function drillTileAndBurrowers(
  state: AuthorityState,
  playerId: string,
  tile: TilePoint,
  requestedTicks: number,
): RuleEffect {
  const params = planetParamsOf(state.planet)
  if (params === null) return unchanged(state)
  const drilled = drillOnTile(state, params, playerId, tile, requestedTicks)
  const cut = drillBurrowersOnTile(drilled.state, playerId, tile, drilledTicksOf(drilled.events))
  return { state: cut.state, events: [...drilled.events, ...cut.events] }
}

function drilledTicksOf(events: readonly DomainEventBody[]): number {
  return events.reduce(
    (ticks, event) => ticks + (event.type === 'DrillDamageDealt' ? event.ticks : 0),
    0,
  )
}

function markCharged(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  return unchanged(markChargedState(state, playerId, tick))
}

function markChargedState(state: AuthorityState, playerId: string, tick: number): AuthorityState {
  return withVehicle(state, playerId, { ...vehicleOf(state, playerId), accountedTick: tick })
}
