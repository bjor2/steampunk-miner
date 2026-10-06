/**
 * The pacing bot and the heat planets (#113 "the pacing bot finishes P8-P10 using refractory"): it
 * unlocks the act's lining type at the Upgrade bay as soon as it is offered and paid for (the
 * unlock selects it), and turns for home once the gauge reaches 90 of 100, before the hull takes
 * heat damage. The surface and the dock cool it again for the next dive.
 */
import { liningPriceOf, liningOf, isLiningTypeOffered } from '../authority/liningRules'
import { hazardArchetypeOn } from '../economy/heatEconomy'
import type { Money } from '../money'
import { isLiningTypeOwned } from '../vehicle/liningType'
import { heatUnitsOfPoints } from '../vehicle/vehicleHeat'
import type { BotSession } from './botSession'

/** The gauge level, in points, at which the bot stops digging and heads home. */
const TURN_BACK_HEAT_POINTS = 90

/** The act's lining type and its price, while it is offered here and not yet owned; else null. */
export function liningUnlockFor(session: BotSession): { liningType: string; price: Money } | null {
  const state = session.state()
  const archetype = hazardArchetypeOn(state.planet.index)
  if (archetype === null) return null
  const { liningType } = archetype
  const isOwned = isLiningTypeOwned(liningOf(state, session.playerId), liningType)
  if (isOwned || !isLiningTypeOffered(state, session.playerId, liningType)) return null
  return { liningType, price: liningPriceOf(state, liningType) }
}

export function isTooHotToDig(session: BotSession): boolean {
  return session.vehicle().heat.level >= heatUnitsOfPoints(TURN_BACK_HEAT_POINTS)
}
