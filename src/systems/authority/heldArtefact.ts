/**
 * The artefact a player holds (decision #46): authority state, in the digest and the save, kept
 * through dock, travel and the rescue tow. The slice holds at most one, so a player either has
 * none or exactly this. Whether a planet's cache is live is never stored: it is read from this at
 * interact time (Technical Director's amendment on #46), so the ground never records a choice.
 */
import { isArtefactId, type ArtefactId } from '../artefacts/artefactOptions'
import { isJsonObject, isWholeNumber } from './payloadFields'

export interface HeldArtefact {
  id: ArtefactId
  /** The planet whose cache it was taken from: that cache reads `chosen`, every other `inert`. */
  fromPlanet: number
  /** `breathing_room`'s brace: 1 while ready this dock cycle, 0 once spent; 0 for the others. */
  breathingRoomCharges: number
}

/** `debug.artefact`'s `cacheState` (#46 amendment 4). */
export type ArtefactCacheState = 'available' | 'inert' | 'chosen'

/** Live while the player holds nothing; the cache the held one came from reads `chosen`. */
export function cacheStateOf(held: HeldArtefact | null, planetIndex: number): ArtefactCacheState {
  if (held === null) return 'available'
  return held.fromPlanet === planetIndex ? 'chosen' : 'inert'
}

/** What a snapshot or save may hold for a player's artefact: null or a well-formed one. */
export function heldArtefactProblems(value: unknown, path: string): string[] {
  if (value === null) return []
  const isValid =
    isJsonObject(value) &&
    isArtefactId(value.id) &&
    isWholeNumber(value.fromPlanet) &&
    (value.breathingRoomCharges === 0 || value.breathingRoomCharges === 1)
  return isValid ? [] : [`${path} must be null or an artefact id, fromPlanet and 0 or 1 charges`]
}
