/**
 * A hazard contact's hit on the hull (ticket 848, `economy/hazardContactLaw.ts`): a share of the
 * planet's on-curve hull, weighed by the arc the cell lies in from the rig's reported pose, held to
 * what the dive's cap still leaves and counted in the vehicle's `hazardHullBp` until the dock. The
 * hull stops at 0; the contact then lets `destroyIfHullGone` wreck the rig with its kind as cause.
 * A hit of 0 changes nothing.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import type { HitArc } from '../../economy/economyDefinition'
import { hazardHitBp, hazardHullOf } from '../../economy/hazardContactLaw'
import { cmp, sub, ZERO_MONEY, type BigStat } from '../../money'
import type { VehiclePose } from '../../vehicle/vehiclePose'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { vehicleOf, withVehicle, type AuthorityState } from '../authorityState'
import type { RuleEffect } from '../commandRule'
import { hitArcOf } from '../combat/hitArc'
import { destroyIfHullGone } from '../vehicleTransitions'

export interface HazardHit {
  hullBp: number
  arc: HitArc
}

/** The hull share a contact asks, and the dive cap that holds every contact of the dive. */
export interface HazardHitAsk {
  shareBp: number
  diveHullCapBp: number
}

/** The player's rig after the hit from the cell at `tile`, and the hit as it landed. */
export function takeHazardHit(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  tile: TilePoint,
  ask: HazardHitAsk,
): { state: AuthorityState; hit: HazardHit } {
  const vehicle = vehicleOf(state, playerId)
  const arc = arcOfCell(vehicle.pose, tile)
  const taken = vehicle.hazardHullBp ?? 0
  const hullBp = hazardHitBp(ask.shareBp, arc, taken, ask.diveHullCapBp)
  if (hullBp === 0) return { state, hit: { hullBp, arc } }
  const hull = atLeastZero(sub(vehicle.hull, hazardHullOf(params.planetIndex, hullBp)))
  const hit = { ...vehicle, hull, hazardHullBp: taken + hullBp }
  return { state: withVehicle(state, playerId, hit), hit: { hullBp, arc } }
}

/** A hull a contact took to 0 wrecks the rig, the hazard kind its cause. */
export function wreckIfHullGone(state: AuthorityState, playerId: string, kind: string): RuleEffect {
  return destroyIfHullGone(state, playerId, state.tick, kind)
}

/** The arc the cell's centre lies in from the pose; a rig with no pose meets it head on. */
function arcOfCell(pose: VehiclePose | null, tile: TilePoint): HitArc {
  if (pose === null) return 'front'
  const centreOf = (index: number) => index * MM_PER_METRE + MM_PER_METRE / 2
  return hitArcOf(pose, centreOf(tile.tx) - pose.x, centreOf(tile.ty) - pose.y)
}

function atLeastZero(amount: BigStat): BigStat {
  return cmp(amount, ZERO_MONEY) < 0 ? ZERO_MONEY : amount
}
