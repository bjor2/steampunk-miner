/**
 * The vehicle's play commands (decisions #7, #3, #11 amendments):
 *
 * - `reportPose`: the client-owned pose at 5 Hz plus the fixed steps each action was active since
 *   the last report and the drive signs pushed at the report (ticket 279, read by drill gear); the authority charges energy as count times rate (drill 4, thrust 6, drive 1
 *   quanta) and carves the drill's stamp at the pose for the drill ticks (#36), then lays casing
 *   rings behind the drill every 0.5 m it cut (#41, #56); it also telegraphs a casing grade too low
 *   for the band (#41), and logs the guns' hits since the last report (#107), then settles the heat gauge
 *   on a heat planet and burns a vehicle touching lava (#113). A report that drives the vehicle
 *   into a magnetic field says so (spec #258, ticket 290). While a slice provides turret shapes,
 *   a report notes whether the rig moved or drilled, for the sentry cam (ticket 382). A stranded
 *   or destroyed vehicle still reports its pose (gravity and hits apply) but its action ticks are
 *   ignored.
 * - `drillTile`: scripted mining of one tile within reach: the same drilling path, carving that
 *   cell's own samples, and the same casing rings behind the drill from the last reported pose
 *   (#115), so a scripted dig pays the lining a player's dig pays. Its `ticks` name the window
 *   it may cut in, counted on the swept cut's sub-steps in the rig's drill quantum, and it is
 *   charged and heated on the law work it removed (ticket 559), so a cell can clear in part of a
 *   tick and several `drillTile`s at one tick each pay only their own cell.
 * - `requestRescue`: calls the tow for a stranded or destroyed vehicle.
 *
 * With the dev flag `drill.sweptCut` on, `drillStep` (`drillStepRules.ts`, ticket 330) cuts every
 * tick the drill is engaged; a report whose drill ticks those steps already cut charges and lays
 * only the rest: movement, heat (for the steps' summed dig time, ticket 335), lava and the rings
 * now due.
 *
 * Action tick counts may not exceed the ticks since the last charged command plus one report
 * interval of slack; more is refused (never trimmed), so a tap is charged exactly once.
 */
import { POSE_REPORT_INTERVAL_TICKS } from '../../constants/balance'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import {
  isFacing,
  isWithinDrillReach,
  poseProblems,
  type Facing,
  type VehiclePose,
} from '../vehicle/vehiclePose'
import { reportSpeedOfStepBound } from '../vehicle/stepBound'
import { isVehicleActive, type VehicleState } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import { isRemovableCell } from '../world/worldCell'
import { cellDensitySum } from '../world/cellYield'
import type { PlanetParams } from '../world/planetParams'
import { materialCellAt, type WorldState } from '../world/worldState'
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
import { layCasingAfterScriptedDrill, layCasingAtPose, layDueCasingAtPose } from './casingPlacement'
import { followCasingSupport } from './casingSupport'
import { flushGunHits } from './combat/gunHits'
import { noteReportForCombat } from './combat/poseReportCombat'
import { drillCell } from './groundDrill'
import { touchLavaAtPose } from './lava/lavaRules'
import { enterMagneticField } from './magnetic/fieldEntry'
import { noPlanetRejection, planetParamsOf } from './planetOfState'
import {
  actionTicksOf,
  drillReportedTicks,
  followCarriedHeat,
  followReportedHeat,
  withBurrowersCut,
} from './reportedDrill'
import { followGatedBite } from './reportedGateBite'
import { noteReportedStillness, noteRigCut } from './rigStillness'
import { stepBoundsAt } from './stepBoundRead'
import { isCutBySteps } from './sweptDrill'
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
      drive: 'driveSigns',
    },
    reject: (state, command) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => poseRejection(state, command),
        () => tickBudgetRejection(state, command, actionTicksOf(command.payload)),
      ]),
    apply: (state, command) =>
      chainEffects(state, [
        (current) =>
          unchanged(
            noteReportedStillness(current, command.playerId, command.payload, command.tick),
          ),
        (current) => recordPose(current, command),
        (current) =>
          enterMagneticField(
            current,
            command.playerId,
            vehicleOf(state, command.playerId),
            command.tick,
          ),
        (current) => followCasingSupport(current, command.playerId),
        (current) => noteReportForCombat(current, command.playerId, command.tick),
        (current) => flushGunHits(current, command.playerId),
        (current) => chargeReportedActions(current, command, vehicleOf(state, command.playerId)),
        (current) => layReportedCasing(current, command),
        (current) => followReportedHeat(current, command, vehicleOf(state, command.playerId)),
        (current) =>
          touchLavaAtPose(current, command.playerId, command.tick, command.payload.drillTicks > 0),
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
        (current) => unchanged(noteRigCut(current, command.playerId, command.tick)),
        (current) => followCarriedHeat(current, command.playerId, command.tick, false),
        (current) => markCharged(current, command.playerId, command.tick),
        (current) => layCasingAfterScriptedDrill(current, command.playerId, command.payload.ticks),
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

/** A report carries the body's speed from the tick before, so the travelling bound checks it. */
function poseRejection(
  state: AuthorityState,
  { playerId, payload }: AuthorityCommand<'reportPose'>,
): Rejection | null {
  const maxSpeed = reportSpeedOfStepBound(stepBoundsAt(state, playerId).travellingMm)
  const problems = poseProblems(poseOf(payload), maxSpeed)
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

/** A cell with density left that is not the pad; a yielded cell is still drilled clear (#36). */
function drillableRejection(state: AuthorityState, command: AuthorityCommand<'drillTile'>) {
  const params = planetParamsOf(state.planet)
  const tile = { tx: command.payload.tx, ty: command.payload.ty }
  if (params !== null && isDrillableCell(state.world, params, tile)) return null
  return rejectionOf('not_drillable', `tile ${tile.tx},${tile.ty} is open ground or the dock pad`)
}

function isDrillableCell(world: WorldState, params: PlanetParams, tile: TilePoint): boolean {
  const material = materialCellAt(world, params, tile)
  return isRemovableCell(material) && cellDensitySum(world, params, tile) > 0
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

/**
 * Drill at the nose first, then thrust, then drive, each only as far as the tank allows; a gated
 * cell the drill's bite already reported is not reported again (ticket 519). `before` is the
 * vehicle before the report: its pose is the previous reported pose the capsule starts from
 * (ticket 537), and its bite the one the gates were last reported for.
 */
function chargeReportedActions(
  state: AuthorityState,
  command: AuthorityCommand<'reportPose'>,
  before: VehicleState,
): RuleEffect {
  const { playerId, payload, tick } = command
  const vehicle = vehicleOf(state, playerId)
  const params = planetParamsOf(state.planet)
  if (!isVehicleActive(vehicle) || params === null || vehicle.pose === null) {
    return unchanged(markChargedState(state, playerId, tick))
  }
  const drilled = followGatedBite(
    drillReportedTicks(state, playerId, vehicle, { before, tick, payload }),
    playerId,
    vehicle,
    { tick, drillTicks: payload.drillTicks },
  )
  const moved = chargeMovement(drilled.state, playerId, payload)
  return { state: markChargedState(moved, playerId, tick), events: drilled.events }
}

/** Rings behind the drill: the report's own cut records its axis; the steps' cut recorded theirs. */
function layReportedCasing(
  state: AuthorityState,
  command: AuthorityCommand<'reportPose'>,
): RuleEffect {
  const { playerId, payload } = command
  if (isCutBySteps(vehicleOf(state, playerId))) return layDueCasingAtPose(state, playerId, payload)
  return layCasingAtPose(state, playerId, payload)
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
  const tile = { tx, ty }
  const params = planetParamsOf(state.planet)
  if (params === null) return unchanged(state)
  const drilled = drillCell(state, params, command.playerId, tile, ticks)
  return withBurrowersCut(drilled, command.playerId, tile)
}

function markCharged(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  return unchanged(markChargedState(state, playerId, tick))
}

function markChargedState(state: AuthorityState, playerId: string, tick: number): AuthorityState {
  return withVehicle(state, playerId, { ...vehicleOf(state, playerId), accountedTick: tick })
}
