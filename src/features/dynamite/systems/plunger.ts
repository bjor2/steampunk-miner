/**
 * The plunger (#153 amendment 2; the #189 and #149 locks), from `remote_detonator` at P22:
 *
 * - Before the row opens, Detonate is not offered and every fuse runs as before.
 * - Once open, the plunger fires the caller's live charge: early for a fused size 1 to 6 (its fuse
 *   still blows it if nobody presses), and the only way to fire a remote size 7 to 10.
 * - The interlock: fired from within the blast's radius + 1 tile, the plunger clunks
 *   (`in_radius`) and the charge stays live.
 * - Fired, the blast is the kernel's (`detonatePlantedCharge`, `by: plunger`); its ground was
 *   generated from the plant on, so it starts clearing with no generation stall.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { isFeatureUnlocked } from '../../../systems/authority/featureUnlocks'
import { chargeRadiusMm } from '../../../systems/economy/chargeSizes'
import { chargeCentreMm, type PlantedCharge } from '../../../systems/vehicle/vehicleCharges'
import type { VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { REMOTE_DETONATOR_ROW_ID } from './dynamiteSizes'

/** The interlock reaches one tile past the blast (#153: "within radius + 1 tile"). */
const INTERLOCK_MARGIN_MM = MM_PER_METRE

export function isDetonatorOpen(state: AuthorityState): boolean {
  return isFeatureUnlocked(state, REMOTE_DETONATOR_ROW_ID)
}

/** The caller's one live charge, or null with none planted. */
export function liveChargeOf(state: AuthorityState, playerId: string): PlantedCharge | null {
  return vehicleOf(state, playerId).charges.planted
}

/** Whether a press of the plant key is Detonate now: the plunger is open and a charge is live. */
export function isDetonateOffered(state: AuthorityState, playerId: string): boolean {
  return isDetonatorOpen(state) && liveChargeOf(state, playerId) !== null
}

/** The interlock's reach round a charge of `size`: its radius plus a tile, in mm. */
export function interlockReachMm(size: number): number {
  return chargeRadiusMm(size) + INTERLOCK_MARGIN_MM
}

/**
 * Whether the vehicle stands within the interlock of `charge`, measured from the vehicle's centre
 * to the charge tile's centre as the blast measures. A vehicle with no pose counts as inside.
 */
export function isWithinInterlock(pose: VehiclePose | null, charge: PlantedCharge): boolean {
  if (pose === null) return true
  const centre = chargeCentreMm(charge)
  const dxMm = pose.x - centre.xMm
  const dyMm = pose.y - centre.yMm
  const reachMm = interlockReachMm(charge.size)
  return dxMm * dxMm + dyMm * dyMm <= reachMm * reachMm
}
