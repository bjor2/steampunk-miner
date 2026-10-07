/**
 * The bot's arrival on a planet and its travel on (#10): travel goes as soon as the platform
 * allows it, and each planet gets a fresh mine and fresh planet-scoped habits, so a rack wanted
 * (#129), flanks watched after a death (#130) or routes closed after replayed deaths (#198) on one planet do not carry to the next.
 */
import { canTravel } from '../authority/travelRules'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { bayRestTileOf } from '../world/dockBays'
import type { ChargePolicy } from './botCharges'
import { noRouteDeaths } from './botDeathReplay'
import type { BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { paramsOfSession } from './botWorld'
import { newMineLayout } from './mineLayout'

/** The bot on the planet its session is on, at the Sell bay with a mine not yet dug. */
export function botPlanetOf(session: BotSession, chargePolicy: ChargePolicy): BotPlanet {
  const site = dockSiteOfPlanet(session.state().planet)
  if (site === null) throw new Error('the bot plays only on a generated planet')
  return {
    layout: newMineLayout(paramsOfSession(session.state()), site),
    pilot: { position: bayRestTileOf(site, 'sell'), facing: 1 },
    chargePolicy,
    hasMetBlastTile: false,
    hasBeenDestroyedHere: false,
    routeDeaths: noRouteDeaths(),
  }
}

/** Travels once the core is done and the platform allows it; the new planet starts afresh. */
export function travelWhenReady(session: BotSession, planet: BotPlanet): BotPlanet {
  const state = session.state()
  if (!state.core.isCompleted || !canTravel(state, session.playerId)) return planet
  session.submit({ type: 'travel', payload: { toPlanet: state.planet.index + 1 } })
  return botPlanetOf(session, planet.chargePolicy)
}
