/**
 * Entering a magnetic field (spec #258, the GD ruling on Q2, ticket 290): a pose report that
 * carries an active vehicle from outside every field into one says `MagneticFieldEntered`, which
 * the codex records as `hazard:magnetic` the first time. Only a drive in counts. A report further
 * from the last than the vehicle could travel in the ticks between is a move nobody drove: a debug
 * teleport or a scenario's start depth, which log `debug_command_applied` and never count as play.
 */
import { MAX_SPEED_MM_PER_SECOND, POSE_REPORT_INTERVAL_TICKS } from '../../../constants/balance'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { magneticFieldHolding } from '../../registries/magneticGround'
import { tileOfPose, type VehiclePose } from '../../vehicle/vehiclePose'
import { isVehicleActive, type VehicleState } from '../../vehicle/vehicleState'
import type { PlanetParams } from '../../world/planetParams'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { unchanged, type RuleEffect } from '../commandRule'
import { planetParamsOf } from '../planetOfState'

/** Says the entry when the report that left `before` behind drove the vehicle into a field. */
export function enterMagneticField(
  state: AuthorityState,
  playerId: string,
  before: VehicleState,
  tick: number,
): RuleEffect {
  const params = planetParamsOf(state.planet)
  if (params === null || !isDrivenEntry(params, before, vehicleOf(state, playerId), tick)) {
    return unchanged(state)
  }
  return { state, events: [{ type: 'MagneticFieldEntered', planetIndex: params.planetIndex }] }
}

function isDrivenEntry(
  params: PlanetParams,
  before: VehicleState,
  after: VehicleState,
  tick: number,
): boolean {
  if (before.pose === null || after.pose === null || !isVehicleActive(after)) return false
  return (
    isWithinTravel(before, after.pose, tick) &&
    !isInField(params, before.pose) &&
    isInField(params, after.pose)
  )
}

/** Whether the vehicle could have driven to `pose` at top speed since its last report. */
function isWithinTravel(before: VehicleState, pose: VehiclePose, tick: number): boolean {
  const from = before.pose as VehiclePose
  const ticks = tick - before.accountedTick + POSE_REPORT_INTERVAL_TICKS
  const reachMm = (MAX_SPEED_MM_PER_SECOND * ticks) / TICKS_PER_SECOND
  const dx = pose.x - from.x
  const dy = pose.y - from.y
  return dx * dx + dy * dy <= reachMm * reachMm
}

function isInField(params: PlanetParams, pose: VehiclePose): boolean {
  return magneticFieldHolding(params, tileOfPose(pose)) !== null
}
