/**
 * What the pacing bot may spend at a bay (#29 Systems & Economy note 3): a purchase must leave the
 * next service paid for, and the travel fee too once the core is done. From the attrition planets
 * on (#198) a brass step (a track level) must also leave #180's service reserve and one rescue
 * fee, so two deaths after a spree still leave the bot a tow and a service: on T9's 0.85 run it
 * bought boiler 47 to 54, died twice and had nothing left to play on. A slice purchase that is not
 * due keeps that reserve too (`botSlicePurchases.ts`, #411's anchor prices).
 */
import type { AuthorityState } from '../authority/authorityState'
import { serviceReserveOf } from '../authority/serviceReserve'
import type { UpgradeId } from '../economy/economyDefinition'
import { rechargePrice, repairPrice, rescueFee, travelFee } from '../economy/planetCharges'
import type { VehicleStats } from '../economy/vehicleStats'
import { add, cmp, fromSafeInteger, sub, type Money } from '../money'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { isAttritionPlanet } from './botAttrition'
import type { BotSession } from './botSession'

/** A purchase must leave the next service (and the travel fee, once the core is done) paid for. */
export function canPay(session: BotSession, price: Money): boolean {
  return cmp(walletOf(session), add(price, moneyKeptBack(session))) >= 0
}

/** A track step or a slice's optional buy: paid for as any purchase, leaving the brass reserve. */
export function canPayForBrass(session: BotSession, price: Money): boolean {
  return canPay(session, price) && leavesBrassReserve(session, price)
}

export function walletOf(session: BotSession): Money {
  return session.state().players[session.playerId].wallet
}

/**
 * What `steps` next steps on a track cost the wallet: their price and what they add to the
 * service reserve, read by the authority's own rule on the state after them. A boiler step raises
 * the recharge and a hull step the repair of the damage (`chainStampOf`); since ticket 553's boiler
 * rule buys first, a visit that left this out ended a few money under its reserve.
 */
export function trackStepsOutlayOf(
  session: BotSession,
  { track, steps, price }: { track: UpgradeId; steps: number; price: Money },
): Money {
  const state = session.state()
  const after = withTrackStepsBought(state, session.playerId, track, steps)
  return add(
    price,
    sub(serviceReserveOf(after, session.playerId), serviceReserveOf(state, session.playerId)),
  )
}

/** The state with `steps` more steps on the player's track, nothing else changed. */
function withTrackStepsBought(
  state: AuthorityState,
  playerId: string,
  track: UpgradeId,
  steps: number,
): AuthorityState {
  const player = state.players[playerId]
  const { vehicle } = player
  const levels = { ...vehicle.levels, [track]: vehicle.levels[track] + steps }
  const players = { ...state.players, [playerId]: { ...player, vehicle: { ...vehicle, levels } } }
  return { ...state, players }
}

function moneyKeptBack(session: BotSession): Money {
  const state = session.state()
  const planetIndex = state.planet.index
  const service = fullServiceOf(planetIndex, statsOfVehicle(session.vehicle()))
  return state.core.isCompleted ? add(service, travelFee(planetIndex)) : service
}

/** A full repair and a full recharge of a vehicle with these stats. */
function fullServiceOf(planetIndex: number, stats: VehicleStats): Money {
  return add(
    repairPrice(planetIndex, stats.hullMax, stats.hullMax),
    rechargePrice(planetIndex, fromSafeInteger(stats.energyMax)),
  )
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
