/**
 * `drillStep {x, y, drive}` (TD scope on #316 as the GD locked it, ticket 330, behind the dev flag
 * `drill.sweptCut`): the client sends one every fixed step its drill is engaged, beside the 5 Hz
 * `reportPose`, and the authority cuts that tick along the path the stamp swept (`sweptDrill.ts`).
 *
 * - The step is the last reported pose (its up vector and facing) moved to `x, y`; `drive.y` 1 is
 *   the lift, as the report's drive says (ticket 279). It never changes the reported pose, so
 *   collapse, combat, heat and lava keep reading the reports.
 * - Refused, cutting nothing, with no planet, an inactive vehicle or no reported pose, a second
 *   step in one tick (`too_many_ticks`), or a step further from the last accepted position (the
 *   last step's, or else the report's) than the rig's stats allow in the ticks since it
 *   (`invalid_pose`, the stats-derived bound of ticket 334, `stepBoundRead.ts`).
 * - It cuts the whole clear sweep, by the per-cell walk or the span as the per-cell budget picks
 *   (`drillStepCut.ts`, ticket 335). Energy is the drill's for the tick it cut; burrowers in the
 *   nose's tile are cut as by a report.
 * - The collapse watch does not run after it (`applyCommand.ts`): it stays on `reportPose`, so it
 *   lags a step by at most one report interval, well inside a block's 60-tick warning.
 */
import type { SweptCut } from '../vehicle/sweptCut'
import { noseTileOf, type VehiclePose } from '../vehicle/vehiclePose'
import { isVehicleActive, type VehicleState } from '../vehicle/vehicleState'
import type { AuthorityCommand } from './authorityCommand'
import { vehicleOf, type AuthorityState } from './authorityState'
import {
  chainEffects,
  firstRejection,
  rejectionOf,
  unchanged,
  type CommandRule,
  type Rejection,
  type RuleEffect,
} from './commandRule'
import { noPlanetRejection, planetParamsOf } from './planetOfState'
import { cutGateLeftAt, stepBoundsAt, stepReachMmOf } from './stepBoundRead'
import { drillAlongStep } from './drillStepCut'
import { withBurrowersCut } from './vehicleCommandRules'
import { followEnergyChange } from './vehicleTransitions'

type StepCommand = AuthorityCommand<'drillStep'>

export const DRILL_STEP_RULES: { readonly drillStep: CommandRule<'drillStep'> } = {
  drillStep: {
    fields: { x: 'safeInteger', y: 'safeInteger', drive: 'driveSigns' },
    reject: (state, command) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => steppingVehicleRejection(vehicleOf(state, command.playerId)),
        () => repeatedStepRejection(vehicleOf(state, command.playerId), command.tick),
        () => stepLengthRejection(state, command),
      ]),
    apply: (state, command) =>
      chainEffects(state, [
        (current) => cutStep(current, command),
        (current) => followEnergyChange(current, command.playerId, command.tick),
      ]),
  },
}

function steppingVehicleRejection(vehicle: VehicleState): Rejection | null {
  if (isVehicleActive(vehicle) && vehicle.pose !== null) return null
  return rejectionOf('vehicle_not_active', `the vehicle is ${vehicle.mode} or has no pose`)
}

function repeatedStepRejection(vehicle: VehicleState, tick: number): Rejection | null {
  if (vehicle.sweptCut?.tick !== tick) return null
  return rejectionOf('too_many_ticks', 'one drill step per tick')
}

function stepLengthRejection(state: AuthorityState, command: StepCommand): Rejection | null {
  const vehicle = vehicleOf(state, command.playerId)
  const from = lastAcceptedPositionOf(vehicle)
  const boundMm = stepReachMmOf(
    stepBoundsAt(state, command.playerId),
    cutGateLeftAt(vehicle.sweptCut, from.tick),
    command.tick - from.tick,
  )
  const dx = command.payload.x - from.x
  const dy = command.payload.y - from.y
  if (dx * dx + dy * dy <= boundMm * boundMm) return null
  return rejectionOf('invalid_pose', `a drill step may move at most ${boundMm} mm`)
}

/** The last step's position when it came after the last charged report, else the report's. */
function lastAcceptedPositionOf(vehicle: VehicleState): { x: number; y: number; tick: number } {
  const cursor = vehicle.sweptCut
  if (cursor !== undefined && cursor.tick > vehicle.accountedTick) return stepPositionOf(cursor)
  const pose = vehicle.pose as VehiclePose
  return { x: pose.x, y: pose.y, tick: vehicle.accountedTick }
}

function stepPositionOf(cursor: SweptCut): { x: number; y: number; tick: number } {
  return { x: cursor.poseXMm, y: cursor.poseYMm, tick: cursor.tick }
}

function cutStep(state: AuthorityState, { playerId, payload }: StepCommand): RuleEffect {
  const params = planetParamsOf(state.planet)
  const reported = vehicleOf(state, playerId).pose
  if (params === null || reported === null) return unchanged(state)
  const pose = { ...reported, x: payload.x, y: payload.y }
  const nose = noseTileOf(pose)
  const step = { pose, drive: payload.drive, isLifting: payload.drive.y === 1 }
  const drilled = drillAlongStep(state, params, playerId, nose, step)
  return withBurrowersCut(drilled, playerId, nose)
}
