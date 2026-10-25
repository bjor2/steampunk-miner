/**
 * The radii a charge's rings show (D1 #860; the G&V rows on #860 and #869): the danger zone at
 * the rung's own radius, which drives the self hit and the radius + 1 interlock and no Blast Radius
 * level grows, and the ground the blast will clear at the planter's level, from the plant to the
 * blast. The ring art is D7's (#866); this is what it is drawn at. And the rack's soft mark: a size
 * whose ground disc is narrower than the bore the rig already cuts clears nothing the drill does not.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import {
  groundRadiusMmOf,
  UNOWNED_RADIUS_LEVEL,
} from '../../../systems/authority/charges/blastDisc'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import { chargeRadiusMm } from '../../../systems/economy/chargeSizes'
import { drillGearOf } from '../../../systems/registries/drillGear'
import { drillStampRadiusMm } from '../../../systems/vehicle/drillBore'

/** A live charge's two rings round its tile's centre, in whole mm. */
export interface ChargeRings {
  tx: number
  ty: number
  /** The danger zone: the rung's own radius. */
  baseRadiusMm: number
  /** The ground the blast clears, out to the planet's edge. */
  groundRadiusMm: number
}

/** The caller's live charge's rings, or null with none planted or no planet. */
export function liveChargeRingsOf(state: AuthorityState, playerId: string): ChargeRings | null {
  const planted = vehicleOf(state, playerId).charges.planted
  if (planted === null) return null
  const groundRadiusMm = groundReachMmOf(state, planted.size)
  if (groundRadiusMm === null) return null
  return {
    tx: planted.tx,
    ty: planted.ty,
    baseRadiusMm: chargeRadiusMm(planted.size),
    groundRadiusMm,
  }
}

/** The ground a charge of `size` clears at the planter's level on this planet, or null off one. */
export function groundReachMmOf(state: AuthorityState, size: number): number | null {
  const params = planetParamsOf(state.planet)
  if (params === null) return null
  return groundRadiusMmOf(
    { radiusMm: chargeRadiusMm(size), radiusLevel: UNOWNED_RADIUS_LEVEL },
    params,
  )
}

/** Whether a size's ground disc is narrower than the bore the rig cuts: the rack's soft mark. */
export function isSmallerThanCut(state: AuthorityState, playerId: string, size: number): boolean {
  const reachMm = groundReachMmOf(state, size) ?? chargeRadiusMm(size)
  return reachMm < cutHalfWidthMm(state, playerId)
}

/** Half the bore: the drill's stamp and the side cutters' cells past its rim (ticket 234). */
function cutHalfWidthMm(state: AuthorityState, playerId: string): number {
  const sideCells = drillGearOf(state, playerId)?.sideCells ?? 0
  return drillStampRadiusMm() + sideCells * MM_PER_METRE
}
