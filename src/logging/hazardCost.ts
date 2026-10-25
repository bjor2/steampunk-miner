/**
 * What a hazard contact costs in money (ticket 848; the GD lock on #823 Q1: drains at or under 5%
 * of a planet's income): the hull a crush, bite or scald took, at the Sell bay's repair price, and
 * the energy a drain took, at the recharge price, each on the planet it happened on. Read off the
 * contact events and the rig after them, so a bot run's tally prices what the rig will pay at the
 * dock. Any other event costs nothing.
 */
import type { AuthorityState } from '../systems/authority/authorityState'
import { vehicleOf } from '../systems/authority/authorityState'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { hazardHullOf } from '../systems/economy/hazardContactLaw'
import { rechargePrice, repairPrice } from '../systems/economy/planetCharges'
import { div, fromSafeInteger, ZERO_MONEY, type Money } from '../systems/money'
import { ENERGY_QUANTA_PER_UNIT } from '../constants/balance'
import { statsOfVehicle } from '../systems/vehicle/vehicleState'

export function hazardCostOf(state: AuthorityState, playerId: string, event: DomainEvent): Money {
  if (isHullContact(event)) return hullCostOf(state, playerId, event.hullBp)
  if (event.type === 'HazardDrained') return energyCostOf(state, event.quanta)
  return ZERO_MONEY
}

function isHullContact(
  event: DomainEvent,
): event is Extract<DomainEvent, { type: 'HazardBit' | 'HazardRefilled' | 'HazardShoved' }> {
  return (
    event.type === 'HazardBit' || event.type === 'HazardRefilled' || event.type === 'HazardShoved'
  )
}

function hullCostOf(state: AuthorityState, playerId: string, hullBp: number): Money {
  const planet = state.planet.index
  const { hullMax } = statsOfVehicle(vehicleOf(state, playerId))
  return repairPrice(planet, hazardHullOf(planet, hullBp), hullMax)
}

function energyCostOf(state: AuthorityState, quanta: number): Money {
  const units = div(fromSafeInteger(quanta), fromSafeInteger(ENERGY_QUANTA_PER_UNIT))
  return rechargePrice(state.planet.index, units)
}
