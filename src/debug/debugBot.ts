/**
 * The debug API's `bot` namespace (ticket 656, spec #647): `playToPlanet(n)` plays the pacing bot
 * from the session now until it lands on planet `n`, harvesting every core on the way and buying
 * each travel, then replays its commands on the live game through `fastForward`. Only the
 * `fastForward` is a debug line (`debug_command_applied`); the bot's commands are play, so a
 * session that reached its planet this way has `debugApplied` false, and a planet whose travel
 * needs a debug command is never reached. A bot that does not land changes nothing.
 *
 * The bot is loaded on the first call, so a player's build never downloads it.
 */
import { readAuthorityState } from '../store/authorityLink'
import { useGameStore } from '../store/gameStore'
import { stateDigest } from '../systems/authority/stateDigest'
import type { BotArrival } from '../systems/bot/botArrival'
import type { DebugResult } from './debugScreens'

export interface BotArrivalReport {
  planetIndex: number
  tick: number
  /** The bot's commands the live game replayed. */
  commands: number
  /** The live game's state digest after the replay is the one the bot stopped with. */
  isReplayExact: boolean
}

export interface DebugBot {
  /**
   * The pacing bot from now to its landing on `planetIndex` (this planet or up to
   * `MAX_PLANETS_AHEAD` on), replayed on the live game; refused, with nothing changed, when the
   * bot runs out of time on the way.
   */
  playToPlanet(planetIndex: number): Promise<DebugResult<BotArrivalReport>>
}

/** Nine hops at most per call, so a slip of the keyboard cannot stall the page for a day. */
export const MAX_PLANETS_AHEAD = 9

export function createDebugBot(): DebugBot {
  return { playToPlanet: playBotToPlanetUnlessRefused }
}

async function playBotToPlanetUnlessRefused(
  planetIndex: number,
): Promise<DebugResult<BotArrivalReport>> {
  const problems = planetAheadProblems(planetIndex)
  if (problems.length > 0) return { ok: false, problems }
  const { playBotToPlanetFrom } = await import('../systems/bot/botArrival')
  const arrival = playBotToPlanetFrom(readAuthorityState(), game().playerId, planetIndex)
  if (!arrival.isArrived) return { ok: false, problems: [strandedProblemOf(arrival, planetIndex)] }
  return { ok: true, ...replayOnLiveGame(arrival) }
}

const game = () => useGameStore.getState()

function planetAheadProblems(planetIndex: unknown): string[] {
  const from = readAuthorityState().planet.index
  const to = from + MAX_PLANETS_AHEAD
  if (isWholeNumberWithin(planetIndex, from, to)) return []
  return [
    `planetIndex must be a whole number from ${from} to ${to}, got ${JSON.stringify(planetIndex)}`,
  ]
}

function isWholeNumberWithin(value: unknown, from: number, to: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= from && (value as number) <= to
}

function strandedProblemOf(arrival: BotArrival, planetIndex: number): string {
  return (
    `the bot did not land on planet ${planetIndex}: it stopped on planet ${arrival.planetIndex} ` +
    `at tick ${arrival.endTick}`
  )
}

function replayOnLiveGame(arrival: BotArrival): BotArrivalReport {
  game().fastForward(arrival.endTick - readAuthorityState().tick, arrival.script)
  const state = readAuthorityState()
  return {
    planetIndex: state.planet.index,
    tick: state.tick,
    commands: arrival.script.length,
    isReplayExact: stateDigest(state) === arrival.digest,
  }
}
