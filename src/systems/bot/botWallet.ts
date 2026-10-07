/**
 * What the pacing bot may spend at a bay (#29 Systems & Economy note 3): a purchase must leave the
 * next service paid for, and the travel fee too once the core is done.
 */
import { rechargePrice, repairPrice, travelFee } from '../economy/planetCharges'
import { add, cmp, fromSafeInteger, type Money } from '../money'
import { statsOfVehicle } from '../vehicle/vehicleState'
import type { BotSession } from './botSession'

/** A purchase must leave the next service (and the travel fee, once the core is done) paid for. */
export function canPay(session: BotSession, price: Money): boolean {
  return cmp(walletOf(session), add(price, moneyKeptBack(session))) >= 0
}

export function walletOf(session: BotSession): Money {
  return session.state().players[session.playerId].wallet
}

function moneyKeptBack(session: BotSession): Money {
  const state = session.state()
  const planetIndex = state.planet.index
  const stats = statsOfVehicle(session.vehicle())
  const service = add(
    repairPrice(planetIndex, stats.hullMax, stats.hullMax),
    rechargePrice(planetIndex, fromSafeInteger(stats.energyMax)),
  )
  return state.core.isCompleted ? add(service, travelFee(planetIndex)) : service
}
