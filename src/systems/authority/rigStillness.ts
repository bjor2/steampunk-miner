/**
 * The sentry cam's fact (ticket 382, the TD's Q3 on #319): `stillSinceTick`, the last tick the rig
 * moved or its drill cut. A pose report moves it when the reported position changed or the drill
 * ran since the last report; a `drillStep` (the swept cut) or a scripted `drillTile` moves it as
 * it cuts. The guns cover the drill's forward cone once the rig has been still for the shape's
 * `forwardConeAfterTicks`, and the cone closes the tick the drill cuts again, as that tick resets
 * the field.
 *
 * Written only while a slice provides turret shapes (`autoGuns`), so with none no state or digest
 * changes.
 */
import { hasAutoGunsProvider, type TurretShape } from '../registries/autoGuns'
import type { VehicleState } from '../vehicle/vehicleState'
import type { CommandPayloads } from './authorityCommand'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'

type PosePayload = CommandPayloads['reportPose']

/** Before the report's pose is recorded: did the rig move or drill since the last one? */
export function noteReportedStillness(
  state: AuthorityState,
  playerId: string,
  payload: PosePayload,
  tick: number,
): AuthorityState {
  if (!hasAutoGunsProvider()) return state
  const vehicle = vehicleOf(state, playerId)
  const stillSinceTick = isReportStill(vehicle, payload) ? (vehicle.stillSinceTick ?? tick) : tick
  return withVehicle(state, playerId, { ...vehicle, stillSinceTick })
}

/** The drill cut this tick, so the rig is not still. */
export function noteRigCut(state: AuthorityState, playerId: string, tick: number): AuthorityState {
  if (!hasAutoGunsProvider()) return state
  return withVehicle(state, playerId, { ...vehicleOf(state, playerId), stillSinceTick: tick })
}

/** The sentry cam has turned the guns over the drill face. */
export function isForwardConeOpen(
  vehicle: VehicleState,
  shape: TurretShape,
  tick: number,
): boolean {
  const { forwardConeAfterTicks } = shape
  const { stillSinceTick } = vehicle
  if (forwardConeAfterTicks === null || stillSinceTick === undefined) return false
  return tick - stillSinceTick >= forwardConeAfterTicks
}

function isReportStill(vehicle: VehicleState, payload: PosePayload): boolean {
  const { pose } = vehicle
  return (
    pose !== null &&
    pose.x === payload.x &&
    pose.y === payload.y &&
    !payload.drilling &&
    payload.drillTicks === 0
  )
}
