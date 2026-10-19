/**
 * `drillStep {x, y, facing, drive}` (TD scope on #316 as the GD locked it, ticket 330, behind the dev flag
 * `drill.sweptCut`): the client sends one every fixed step its drill is engaged, beside the 5 Hz
 * `reportPose`, and the authority cuts that tick along the path the stamp swept (`sweptDrill.ts`).
 *
 * - The step is the last reported pose (its up vector) moved to `x, y` and turned to the step's
 *   `facing`, the head's settled facing that tick (ticket 506: a report lags a turn by up to 12
 *   ticks, so the cut along its facing stood the body after a turn); `drive.y` 1 is the lift, as
 *   the report's drive says (ticket 279). It never changes the reported pose, so collapse, combat,
 *   heat and lava keep reading the reports.
 * - Refused, cutting nothing, with no planet, an inactive vehicle or no reported pose, a facing
 *   outside 0 to 3 (`invalid_pose`, the range check is the whole audit), a second step in one tick (`too_many_ticks`), or a step further from the last accepted position (the
 *   last step's, or else the report's) than the rig's stats allow in the ticks since it
 *   (`invalid_pose`, the stats-derived bound of ticket 334, `stepBoundRead.ts`).
 * - It cuts the sweep as far as its work reaches (the exact carry, ticket 399), by the per-cell
 *   walks or by runs and the span as the per-cell budget picks (`drillStepCut.ts`, ticket 335). Energy is the drill's for the tick it cut; burrowers in the
 *   nose's tile are cut as by a report.
 * - With `drill.noseContact` on (ticket 564, `combat/noseRide.ts`), after the cut it engages every
 *   enemy its nose met along the body's walked path, from the last accepted position to the step,
 *   in walk order; while an enemy tougher than the rig rides the nose, the step cuts nothing
 *   (`combat/noseHold.ts`).
 * - The collapse watch does not run after it (`applyCommand.ts`): it stays on `reportPose`, so it
 *   lags a step by at most one report interval, well inside a block's 60-tick warning.
 */
import type { SweptCut } from '../vehicle/sweptCut'
import { isFacing, noseTileOf, type Facing, type VehiclePose } from '../vehicle/vehiclePose'
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
import { noteRigCut } from './rigStillness'
import { cutGateLeftAt, stepBoundsAt, stepReachMmOf } from './stepBoundRead'
import { drillAlongStep } from './drillStepCut'
import { withBurrowersCut } from './reportedDrill'
import { holdTheCut, isCutHeld } from './combat/noseHold'
import { engageEnemiesOnPath } from './combat/noseRide'
import type { SweptStep } from './sweptDrill'
import type { PlanetParams } from '../world/planetParams'
import type { TilePoint } from '../world/tileGrid'
import { followEnergyChange } from './vehicleTransitions'

type StepCommand = AuthorityCommand<'drillStep'>

export const DRILL_STEP_RULES: { readonly drillStep: CommandRule<'drillStep'> } = {
  drillStep: {
    fields: { x: 'safeInteger', y: 'safeInteger', facing: 'wholeNumber', drive: 'driveSigns' },
    reject: (state, command) =>
      firstRejection([
        () => noPlanetRejection(state.planet),
        () => steppingVehicleRejection(vehicleOf(state, command.playerId)),
        () => facingRejection(command),
        () => repeatedStepRejection(vehicleOf(state, command.playerId), command.tick),
        () => stepLengthRejection(state, command),
      ]),
    apply: (state, command) =>
      chainEffects(state, [
        (current) => cutStep(current, command),
        (current) => unchanged(noteRigCut(current, command.playerId, command.tick)),
        (current) => followEnergyChange(current, command.playerId, command.tick),
      ]),
  },
}

function steppingVehicleRejection(vehicle: VehicleState): Rejection | null {
  if (isVehicleActive(vehicle) && vehicle.pose !== null) return null
  return rejectionOf('vehicle_not_active', `the vehicle is ${vehicle.mode} or has no pose`)
}

function facingRejection(command: StepCommand): Rejection | null {
  if (isFacing(command.payload.facing)) return null
  return rejectionOf('invalid_pose', `facing must be 0 to 3, got ${command.payload.facing}`)
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
  // `facingRejection` refused any facing outside 0 to 3.
  const pose = { ...reported, x: payload.x, y: payload.y, facing: payload.facing as Facing }
  const nose = noseTileOf(pose)
  const step = { pose, drive: payload.drive, isLifting: payload.drive.y === 1 }
  const walked = { from: lastAcceptedPositionOf(vehicleOf(state, playerId)), pose }
  const drilled = cutUnlessHeld(state, params, playerId, nose, step)
  const engaged = engageEnemiesOnPath(drilled, playerId, walked)
  return withBurrowersCut(engaged, playerId, nose)
}

/** The step's cut, or nothing cut while a tougher enemy rides the nose (ticket 564). */
function cutUnlessHeld(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  nose: TilePoint,
  step: SweptStep,
): RuleEffect {
  if (isCutHeld(state, playerId)) return holdTheCut(state, playerId, step.pose)
  return drillAlongStep(state, params, playerId, nose, step)
}
