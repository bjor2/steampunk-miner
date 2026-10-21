/**
 * The pacing bot played from a session under way to its landing on a later planet (ticket 656,
 * spec #647; the GD's bar that a planet is open only when a fresh save reaches it by buying
 * travel): it harvests every core on the way as `playSlice` does, then travels on from the last
 * one. The bot sends only play commands, never a `debug.*` one, so a planet that a fresh save
 * reaches only with a debug command is never reached here. Its commands come back as a
 * `fastForward` script (#11 section 5), so the live game replays the same trip to the same state.
 */
import { PACING_TARGETS } from '../../constants/pacingTargets'
import { TICKS_PER_SECOND } from '../../constants/physics'
import type { AuthorityCommand } from '../authority/authorityCommand'
import type { AuthorityState } from '../authority/authorityState'
import { stateDigest } from '../authority/stateDigest'
import type { ScriptedCommand } from '../fastForward'
import { createBotSession, type BotSession } from './botSession'
import { botPlanetOf, travelWhenReady } from './botTravel'
import { playSliceFrom } from './playSlice'

export interface BotArrival {
  /** Every command the bot sent, at its tick: the trip as a `fastForward` script. */
  script: readonly ScriptedCommand[]
  /** The tick the bot stopped at. */
  endTick: number
  /** The planet the bot stopped on. */
  planetIndex: number
  isArrived: boolean
  /** The state digest the bot stopped with, for checking a replay against. */
  digest: string
}

/** The longest core a later planet may take (#6 acceptance 7): the bot's time on each planet. */
export const ARRIVAL_TICKS_PER_PLANET =
  PACING_TARGETS.laterPlanetCoreMinutes.max * 60 * TICKS_PER_SECOND

/** The bot from `start` until it lands on `planetIndex`, or its time on the way runs out. */
export function playBotToPlanetFrom(
  start: AuthorityState,
  playerId: string,
  planetIndex: number,
): BotArrival {
  const session = createBotSession(start, playerId)
  harvestCoresBefore(session, planetIndex, start.tick + ticksToPlanetFrom(start, planetIndex))
  travelOnToPlanet(session, planetIndex)
  return arrivalOf(session, planetIndex)
}

function ticksToPlanetFrom(start: AuthorityState, planetIndex: number): number {
  return Math.max(0, planetIndex - start.planet.index) * ARRIVAL_TICKS_PER_PLANET
}

/** Every core up to the planet before `planetIndex`, travelling on after each. */
function harvestCoresBefore(session: BotSession, planetIndex: number, maxTicks: number): void {
  if (session.state().planet.index >= planetIndex) return
  const planet = botPlanetOf(session, 'blast')
  playSliceFrom(session, planet, { maxTicks, lastPlanet: planetIndex - 1 })
}

/** The last hop, taken as the bot takes every hop: once the core is done and travel allows it. */
function travelOnToPlanet(session: BotSession, planetIndex: number): void {
  if (session.state().planet.index !== planetIndex - 1) return
  travelWhenReady(session, botPlanetOf(session, 'blast'))
}

function arrivalOf(session: BotSession, planetIndex: number): BotArrival {
  const state = session.state()
  return {
    script: session.commands().map(scriptedCommandOf),
    endTick: state.tick,
    planetIndex: state.planet.index,
    isArrived: state.planet.index === planetIndex,
    digest: stateDigest(state),
  }
}

/** The command without its player and sequence stamp, which the live game stamps again. */
function scriptedCommandOf({ tick, type, payload }: AuthorityCommand): ScriptedCommand {
  return { tick, type, payload } as ScriptedCommand
}
