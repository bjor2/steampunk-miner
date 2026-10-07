/**
 * The service reserve (#180 section 2 "Spend safety" and amendment 2): what a held chain of steps
 * keeps back, `repair + recharge + restockToCapacity`, plus the travel fee once the core-fragment
 * half of the travel gate is met. Repair is the current damage and restock fills the racks the
 * player owns, so the reserve is read from the state at this tick and a chain's preview recomputes
 * it after every step. No rescue floor. The pacing bot's spree metric spends what lies above it
 * (#181); the `service_reserve` refusal of a held step is the hold-to-buy build's (#177).
 */
import { travelFee } from '../economy/planetCharges'
import { add, ZERO_MONEY, type Money } from '../money'
import { chargesThatFitOf } from '../vehicle/vehicleCharges'
import type { AuthorityState } from './authorityState'
import { chargesOf } from './charges/chargeRules'
import { restockPriceOf } from './charges/chargeShopRules'
import { coreNeededOf } from './coreBay'
import { rechargeCostOf, repairCostOf } from './platformServices'

const BASE_CHARGE_SIZE = 1

export function serviceReserveOf(state: AuthorityState, playerId: string): Money {
  const service = add(repairCostOf(state, playerId), rechargeCostOf(state, playerId))
  return add(add(service, restockReserveOf(state, playerId)), travelReserveOf(state))
}

/**
 * Only a rack the vehicle carries is restocked. Its free slots are priced as size-1 charges, the
 * one size every planet sells, so the reserve stays what it was before the sizes (K8 #218).
 */
function restockReserveOf(state: AuthorityState, playerId: string): Money {
  const charges = chargesOf(state, playerId)
  if (!charges.isRackMounted) return ZERO_MONEY
  return restockPriceOf(state, BASE_CHARGE_SIZE, chargesThatFitOf(charges, BASE_CHARGE_SIZE))
}

/** The fee joins once the bay holds the fragments the travel gate asks for. */
function travelReserveOf(state: AuthorityState): Money {
  const needed = coreNeededOf(state.planet)
  if (needed === null || state.platform.coreBay < needed) return ZERO_MONEY
  return travelFee(state.planet.index)
}
