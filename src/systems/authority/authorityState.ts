/**
 * What the authority owns (decision #3): the planet, and per player the wallet and the last
 * accepted `seq`. Immutable: `applyCommand` returns a new state. Only safe integers, booleans,
 * strings and Money live here, so the canonical JSON and the digest are exact.
 *
 * The vehicle's pose is client-owned and stays out (it arrives later as `reportPose` commands).
 */
import { ZERO_MONEY, type Money } from '../money'

export interface PlayerState {
  wallet: Money
  /** The `seq` of this player's last accepted command; the next one must be higher. */
  lastSeq: number
}

export interface AuthorityState {
  tick: number
  /** Integer planet index (#4); the store still calls it `planetTier`. */
  planet: { index: number; seed: number }
  players: Readonly<Record<string, PlayerState>>
  /** Set by the first accepted `debug.*` command and never reset (#11 section 4). */
  debugApplied: boolean
}

export interface SessionStart {
  planetIndex: number
  planetSeed: number
  playerIds: readonly string[]
}

export function createAuthorityState(start: SessionStart): AuthorityState {
  return {
    tick: 0,
    planet: { index: start.planetIndex, seed: start.planetSeed },
    players: Object.fromEntries(start.playerIds.map((id) => [id, newPlayerState()])),
    debugApplied: false,
  }
}

function newPlayerState(): PlayerState {
  return { wallet: ZERO_MONEY, lastSeq: 0 }
}
