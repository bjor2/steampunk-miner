/**
 * The pacing bot and the heat planets (#113 "the pacing bot finishes P8-P10 using refractory"): it
 * unlocks the act's lining type at the Upgrade bay as soon as it is offered and paid for (the
 * unlock selects it), turns for home while the gauge plus the heat of the climb home stays under
 * 95 of 100, so the hull never takes heat damage, and waits docked until the platform has cooled
 * the gauge to 0 before the next dive (10 points a second, so at most 10 s).
 */
import { TICKS_PER_SECOND } from '../../constants/physics'
import { liningPriceOf, liningOf, isLiningTypeOffered } from '../authority/liningRules'
import { bandHeatPerSecond, hazardArchetypeOn, heatCoolingPerSecond } from '../economy/heatEconomy'
import type { Money } from '../money'
import { isLiningTypeOwned } from '../vehicle/liningType'
import { heatUnitsOfPoints, heatUnitsPerTickOf } from '../vehicle/vehicleHeat'
import { statsOfVehicle } from '../vehicle/vehicleState'
import { bandOfTile } from '../world/planetGeometry'
import type { BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { shaftColumnAt } from './mineLayout'

/** The gauge, the way home's heat included, the bot never lets past this many points. */
const TURN_BACK_HEAT_POINTS = 95

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

/** Docked on a heat planet with heat on the gauge: waits the time the platform takes to cool it. */
export function coolAtDock(session: BotSession): void {
  const vehicle = session.vehicle()
  const planetIndex = session.state().planet.index
  if (vehicle.mode !== 'docked' || hazardArchetypeOn(planetIndex) === null) return
  const perTick = heatUnitsPerTickOf(heatCoolingPerSecond(planetIndex, 'surface'))
  const sinceSettled = session.tick() - vehicle.heat.settledTick
  session.wait(Math.max(0, Math.ceil(vehicle.heat.level / perTick) - sinceSettled))
}

/** The gauge with the climb home added would pass the turn-back line. */
export function isTooHotToDig(session: BotSession, planet: BotPlanet): boolean {
  const heat = session.vehicle().heat.level + heatOfClimbHome(session, planet)
  return heat >= heatUnitsOfPoints(TURN_BACK_HEAT_POINTS)
}

/** Band heat for every row from the pilot up to the pad, at the engine's top speed (#6 model). */
function heatOfClimbHome(session: BotSession, planet: BotPlanet): number {
  const { layout, pilot } = planet
  const planetIndex = session.state().planet.index
  if (hazardArchetypeOn(planetIndex) === null) return 0
  const ticksPerRow = TICKS_PER_SECOND / statsOfVehicle(session.vehicle()).engine.speedMax
  let units = 0
  for (let row = pilot.position.ty; row < layout.travelRow; row++) {
    const band = bandOfTile(layout.params, shaftColumnAt(layout, row), row)
    units += heatUnitsPerTickOf(bandHeatPerSecond(planetIndex, band)) * ticksPerRow
  }
  return units
}
