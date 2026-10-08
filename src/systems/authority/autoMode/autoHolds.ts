/**
 * The holds every item on auto shares (ticket 317, the #310 GD decision, adopted for self-acting
 * items by the GD lock on #206), all read on the authority, never sent by a client:
 *
 * - docked, which covers every store and workshop screen; a vehicle stranded or destroyed;
 * - anchored: the grav anchor's cling is on, so a ceiling cut never sheds ore (#288);
 * - a collapse warning (or its refill) in the block the rig's centre stands in;
 * - the energy reserve: the act must leave the tank at or above the rescue floor plus the item's
 *   `reserveAboveRescueBp` share of it (#322: 10 points, so auto is never what drops the rig into
 *   rescue).
 */
import { BASIS_POINTS } from '../../../constants/balance'
import type { AutoHoldReason } from '../../registries/autoActors'
import { vehicleMotionAt } from '../../registries/vehicleMotionEffects'
import { rescueFloorQuanta } from '../../vehicle/energyQuanta'
import type { VehiclePose } from '../../vehicle/vehiclePose'
import { energyMaxQuantaOf, isVehicleActive, type VehicleState } from '../../vehicle/vehicleState'
import { blockContaining, blockIdOf } from '../../world/collapseBlock'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { entryOfBlock } from '../collapse/collapseState'

/** The first hold the rig itself puts on every item, or null. */
export function rigHoldOf(
  state: AuthorityState,
  playerId: string,
  tick: number,
): AutoHoldReason | null {
  const vehicle = vehicleOf(state, playerId)
  if (vehicle.mode === 'docked') return 'docked'
  if (!isVehicleActive(vehicle) || vehicle.pose === null) return 'inactive'
  if (vehicleMotionAt(state, playerId, tick).isClinging) return 'anchored'
  if (isRigBlockCollapsing(state, vehicle.pose)) return 'collapse_warning'
  return null
}

/** Whether the tank, after the act's energy, still holds the reserve. */
export function isAboveEnergyReserve(
  vehicle: VehicleState,
  actQuanta: number,
  reserveAboveRescueBp: number,
): boolean {
  return vehicle.energy - actQuanta >= energyReserveQuantaOf(vehicle, reserveAboveRescueBp)
}

/** The rescue floor plus `reserveAboveRescueBp` of the tank, each rounded up to a whole quantum. */
export function energyReserveQuantaOf(vehicle: VehicleState, reserveAboveRescueBp: number): number {
  const above = Math.ceil((energyMaxQuantaOf(vehicle) * reserveAboveRescueBp) / BASIS_POINTS)
  return rescueFloorQuanta(vehicle.levels.boiler) + above
}

function isRigBlockCollapsing(state: AuthorityState, pose: VehiclePose): boolean {
  const block = blockContaining({ xMm: pose.x, yMm: pose.y })
  return entryOfBlock(state.collapse, blockIdOf(block)) !== null
}
