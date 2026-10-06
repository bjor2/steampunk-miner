/**
 * Opening one neighbouring tile (#29): drive in when it is open, else bore it from where the bot
 * stands for the ticks the #7 drill rule gives, at the drill power the heat gauge leaves (#113),
 * and bore on while the gauge's throttle left the tile standing; a tile worth a blasting charge
 * (#109, `botCharges.ts`) is blasted open instead, and one met with an empty rack makes the next
 * Upgrade bay visit buy charges (#129). A tile that would free lava, or
 * the bot's tip cannot scratch, is `blocked`; one the tank cannot afford with the way home, `short`.
 */
import { heatThrottledDrill } from '../authority/heatRules'
import { isVehicleActive } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import { blastOpen, isBlastWorthIt, noteTileWorthACharge } from './botCharges'
import { canAffordBore } from './botEnergy'
import { boreTile, enterBoredTile, moveStraight, type BotPlanet } from './botPilot'
import type { BotSession } from './botSession'
import { boreTicks, isLavaRisk, tileKindAt } from './botWorld'

/** Opening a tile: done, impossible for this tip or for the lava, or too dear for the tank. */
export type OpenOutcome = 'opened' | 'blocked' | 'short'

/** A throttled bore tries again at most this many times before giving the tile up. */
const MAX_REBORES = 8

/** Opens a neighbouring tile and moves into it: bores it, or drives in when it is open. */
export function openTile(session: BotSession, planet: BotPlanet, tile: TilePoint): OpenOutcome {
  if (isLavaRisk(session.state(), tile)) return 'blocked'
  if (tileKindAt(session.state(), tile) === 'open') {
    moveStraight(session, planet, tile)
    return isVehicleActive(session.vehicle()) ? 'opened' : 'short'
  }
  const bored = boreInPlace(session, planet, tile)
  if (bored === 'opened') enterBoredTile(planet.pilot, tile)
  return bored
}

/** Bores a neighbouring tile without moving; nothing happens unless it is `opened`. */
export function boreInPlace(session: BotSession, planet: BotPlanet, tile: TilePoint): OpenOutcome {
  if (isLavaRisk(session.state(), tile)) return 'blocked'
  for (let attempt = 0; attempt <= MAX_REBORES; attempt++) {
    const bored = boreOnce(session, planet, tile)
    if (bored !== 'opened' || tileKindAt(session.state(), tile) === 'open') return bored
  }
  return 'blocked'
}

function boreOnce(session: BotSession, planet: BotPlanet, tile: TilePoint): OpenOutcome {
  const vehicle = session.vehicle()
  const drill = heatThrottledDrill(session.state().planet.index, vehicle)
  const ticks = boreTicks(drill, planet.layout.params, tile, tileKindAt(session.state(), tile))
  if (ticks === null) return 'blocked'
  if (!canAffordBore(session, planet, ticks)) return 'short'
  // #129: a tile it would blast with an empty rack is what makes its next visit buy charges.
  noteTileWorthACharge(session, planet, tile, ticks)
  // #109: blast it open when that pays; the bot backs off and comes back to the same tile.
  if (isBlastWorthIt(session, planet, tile, ticks) && blastOpen(session, planet, tile)) {
    return isVehicleActive(session.vehicle()) ? 'opened' : 'short'
  }
  boreTile(session, planet.pilot, tile, ticks)
  return isVehicleActive(session.vehicle()) ? 'opened' : 'short'
}
