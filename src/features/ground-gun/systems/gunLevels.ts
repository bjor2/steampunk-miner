/**
 * Each player's bore gun levels (the `ground-gun` save section v1, ticket 314): the level bought on
 * each of the three brass tracks, 0 on all three until the gun is mounted. Mounting buys every
 * track's first level at once, so a mounted gun is at least level 1 everywhere and a track's level
 * always names the stats it fires with (#322's L1 is the first bought level). At its initial
 * value the section is out of the state and the digest, so a player who never buys the gun saves
 * and digests as before.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { isJsonObject, isWholeNumber } from '../../../systems/authority/payloadFields'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import { GUN_TRACK_IDS, type GunTrackId } from './groundGunEconomy'

export type GunLevels = Readonly<Record<GunTrackId, number>>

export const UNMOUNTED_GUN: GunLevels = { rate: 0, penetration: 0, energy: 0 }

/** The level every track holds once the gun is mounted. */
export const MOUNTED_LEVEL = 1

export const GROUND_GUN_SECTION: SaveSection<GunLevels> = {
  id: 'ground-gun',
  version: 1,
  scope: 'player',
  initial: UNMOUNTED_GUN,
  problems: gunLevelsProblems,
  toPortable: (value) => value,
  ofPortable: (body) => body as GunLevels,
}

export function gunLevelsOf(state: AuthorityState, playerId: string): GunLevels {
  return readSection(state, playerId, GROUND_GUN_SECTION)
}

export function withGunLevels(
  state: AuthorityState,
  playerId: string,
  levels: GunLevels,
): AuthorityState {
  return withSection(state, playerId, GROUND_GUN_SECTION, levels)
}

/** Whether the gun is on the miner: mounting sets every track to its first level. */
export function isGunMounted(levels: GunLevels): boolean {
  return levels.rate >= MOUNTED_LEVEL
}

/** The levels with every track at its first level: what the mount buys. */
export function mountedLevels(): GunLevels {
  return { rate: MOUNTED_LEVEL, penetration: MOUNTED_LEVEL, energy: MOUNTED_LEVEL }
}

/** The levels with `trackId` one level on. */
export function raisedLevels(levels: GunLevels, trackId: GunTrackId): GunLevels {
  return { ...levels, [trackId]: levels[trackId] + 1 }
}

/** Why a saved body is not a ground-gun section; empty when it is one. */
export function gunLevelsProblems(body: unknown): string[] {
  if (!isJsonObject(body)) return ['the ground-gun section must be an object']
  return GUN_TRACK_IDS.filter((trackId) => !isWholeNumber(body[trackId])).map(
    (trackId) => `ground-gun.${trackId} must be a whole level`,
  )
}
