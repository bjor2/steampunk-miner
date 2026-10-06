/**
 * The first-place lining charge (decision #76, build #85): each ring that lines native rock for the
 * first time is charged for the stretch of tunnel axis it stands for (`AxisPoint.lengthMm`, half a
 * metre at a player's #41 spacing), `ceilMilli(k_casing * V(t(p,b)) * lengthM)` at the band `b` of
 * the wall it lined, so lining is paid per metre of tunnel, not per ring (#115), times its lining
 * type's multiplier (#113: refractory 1.5). Relaying lining of another type counts as first
 * placement of the new type. Relining the same type and grade bumps line no new rock, so they cost
 * nothing; the grade never enters the price.
 *
 * When it is paid (#76 amendment, #115): nothing leaves the wallet mid-dive. `casing_lined` logs the
 * price as the ring is laid and the price joins the vehicle's lining bill, which the Sell bay
 * settles out of the next sale (`liningBill.ts`). A player who dives with an empty wallet pays the
 * same lining as one who dives with savings, and the lining is laid whatever either holds.
 */
import { MM_PER_METRE } from '../../constants/physics'
import { casingLiningPrice } from '../economy/casingPrices'
import { add, div, fromSafeInteger, toCanonical, type BigStat } from '../money'
import { casingBandOfWall } from '../world/casingBand'
import type { PlanetParams } from '../world/planetParams'
import type { WeightedSample } from '../world/stampShape'
import { vehicleOf, withVehicle, type AuthorityState } from './authorityState'
import { unchanged, type RuleEffect } from './commandRule'

/** One ring's first lining: the wall it lined, the stretch of axis it stands for and its type. */
export interface FirstLining {
  wall: readonly WeightedSample[]
  lengthMm: number
  grade: number
  liningType: string
}

/** Bill one ring's newly lined wall; a ring that lined no new rock is free and logs nothing. */
export function chargeFirstLining(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  lining: FirstLining,
): RuleEffect {
  if (lining.wall.length === 0) return unchanged(state)
  const band = casingBandOfWall(params, lining.wall)
  const price = casingLiningPrice(
    params.planetIndex,
    band,
    metresOf(lining.lengthMm),
    lining.liningType,
  )
  const vehicle = vehicleOf(state, playerId)
  return {
    state: withVehicle(state, playerId, { ...vehicle, liningBill: add(vehicle.liningBill, price) }),
    events: [
      {
        type: 'CasingLined',
        lengthMm: lining.lengthMm,
        band,
        grade: lining.grade,
        liningType: lining.liningType,
        price: toCanonical(price),
      },
    ],
  }
}

function metresOf(lengthMm: number): BigStat {
  return div(fromSafeInteger(lengthMm), fromSafeInteger(MM_PER_METRE))
}
