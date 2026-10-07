/**
 * What the pacing bot may spend at a bay (#29 Systems & Economy note 3): a purchase must leave the
 * next service paid for, and the travel fee too once the core is done. From the attrition planets
 * on (#198) a brass step (a track level) must also leave #180's service reserve and one rescue
 * fee, so two deaths after a spree still leave the bot a tow and a service: on T9's 0.85 run it
 * bought boiler 47 to 54, died twice and had nothing left to play on.
 */
import { serviceReserveOf } from '../authority/serviceReserve'
import { rechargePrice, repairPrice, rescueFee, travelFee } from '../economy/planetCharges'
import { add, cmp, fromSafeInteger, sub, type Money } from '../money'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { isAttritionPlanet } from './botAttrition'
import type { BotSession } from './botSession'

/** A purchase must leave the next service (and the travel fee, once the core is done) paid for. */
export function canPay(session: BotSession, price: Money): boolean {
  return cmp(walletOf(session), add(price, moneyKeptBack(session))) >= 0
}

/** A track step: paid for as any purchase, and leaving the brass reserve where it applies. */
export function canPayForBrass(session: BotSession, price: Money): boolean {
  return canPay(session, price) && leavesBrassReserve(session, price)
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

/** Where the brass reserve applies, the wallet after the step still holds it. */
function leavesBrassReserve(session: BotSession, price: Money): boolean {
  if (!isAttritionPlanet(session.state().planet.index)) return true
  return cmp(sub(walletOf(session), price), brassReserveOf(session)) >= 0
}

/**
 * The service reserve plus the fee a tow takes from today's wallet: never less than the fee on
 * what a step leaves, and never cut down to a near-empty wallet as the tow's own fee is (#9), so
 * the fee is really kept.
 */
function brassReserveOf(session: BotSession): Money {
  const state = session.state()
  const fee = rescueFee(state.planet.index, walletOf(session))
  return add(serviceReserveOf(state, session.playerId), fee)
}
