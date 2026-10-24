/**
 * The bot's arrival on a planet and its travel on (#10; a star-map jump since ticket 756): travel
 * goes as soon as the core is done, and each planet gets a fresh mine and fresh planet-scoped habits, so a rack wanted
 * (#129), flanks watched after a death (#130) or routes closed after replayed deaths (#198) on one planet do not carry to the next.
 */
import type { AuthorityState } from '../authority/authorityState'
import { dockedBayOf } from '../authority/dockRules'
import { dockSiteOfPlanet, systemOfPlanet } from '../authority/planetOfState'
import { nextHopShortfallOf } from '../authority/starMap/fuelShopRules'
import { jumpRefusal, type JumpTarget } from '../authority/starMap/jumpRules'
import { buyFuelCommand, jumpToPlanetCommand } from '../platform/platformCommands'
import { placeOfCampaign } from '../starMap/campaignIndex'
import { bayRestTileOf } from '../world/dockBays'
import { DEFAULT_BORE_POLICY, type BorePolicy } from './botBore'
import type { ChargePolicy } from './botCharges'
import { noRouteDeaths } from './botDeathReplay'
import type { BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import type { GateRouteBlock } from './gateRouteBlocks'
import { newDownBoreTally, type DownBoreTally } from './downBores'
import { newSidewaysBoreTally, type SidewaysBoreTally } from './sidewaysBores'
import { paramsOfSession } from './botWorld'
import { newMineLayout } from './mineLayout'
import { driveToSellBay } from './botTrip'

/**
 * The bot on the planet its session is on, at the Sell bay with a mine not yet dug; the run's
 * gate route blocks (ticket 237) and its bore policy (ticket 347) go on from the planet before.
 */
export function botPlanetOf(
  session: BotSession,
  chargePolicy: ChargePolicy,
  gateRouteBlocks: GateRouteBlock[] = [],
  borePolicy: BorePolicy = DEFAULT_BORE_POLICY,
  sidewaysBores: SidewaysBoreTally = newSidewaysBoreTally(),
  downBores: DownBoreTally = newDownBoreTally(),
): BotPlanet {
  const site = dockSiteOfPlanet(session.state().planet)
  if (site === null) throw new Error('the bot plays only on a generated planet')
  return {
    layout: newMineLayout(paramsOfSession(session.state()), site),
    pilot: { position: bayRestTileOf(site, 'sell'), facing: 1, borePolicy },
    chargePolicy,
    hasMetBlastTile: false,
    shellChargeSize: 0,
    hasBeenDestroyedHere: false,
    routeDeaths: noRouteDeaths(),
    gateRouteBlocks,
    sidewaysBores,
    downBores,
    arrivalLevels: { ...session.vehicle().levels },
  }
}

/**
 * Jumps on to the next planet once the core is done ("star map travel", ticket 756): first the
 * fuel the tank lacks for the hop, bought at the Sell bay at the #648 clamp's charge, then the jump
 * the host decides. The bot never skips ahead or comes back, and the starting tank holds the hop.
 * The new planet starts afresh.
 */
export function travelWhenReady(session: BotSession, planet: BotPlanet): BotPlanet {
  if (!session.state().core.isCompleted) return planet
  fuelUpForNextHop(session, planet)
  if (!hasJumpedToNextPlanet(session)) return planet
  return botPlanetOf(
    session,
    planet.chargePolicy,
    planet.gateRouteBlocks,
    planet.pilot.borePolicy,
    planet.sidewaysBores,
    planet.downBores,
  )
}

function fuelUpForNextHop(session: BotSession, planet: BotPlanet): void {
  const shortfall = nextHopShortfallOf(session.state(), session.playerId)
  if (shortfall === 0) return
  if (dockedBayOf(session.state(), session.playerId) !== 'sell') driveToSellBay(session, planet)
  session.submit(buyFuelCommand(shortfall))
}

/** The jump to the next planet of the session's system, when the host lets it go. */
function hasJumpedToNextPlanet(session: BotSession): boolean {
  const target = nextPlanetTargetOf(session.state())
  if (jumpRefusal(session.state(), session.playerId, target) !== null) return false
  session.submit(jumpToPlanetCommand(target.system, target.planet))
  return true
}

/** The next place of the session's system: its planet index is the campaign index (#781). */
function nextPlanetTargetOf(state: AuthorityState): JumpTarget {
  const system = systemOfPlanet(state.planet)
  return { system, planet: placeOfCampaign(system, BigInt(state.planet.index)) + 1n }
}
