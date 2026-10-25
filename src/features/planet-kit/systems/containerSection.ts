/**
 * The placed containers as world state (the `planet-kit.containers` save section v1, ticket 823;
 * the TD's final ruling on #823, points 1 and 4): one session section, so every player's
 * containers sit in the host's world, keyed by the stable planet id `s:p` (#790's
 * `corePlanetKeyOf`), never by g. A jump away and back and a save and load keep them; nothing on
 * planet events clears them, and they never join the #790 core bay.
 *
 * At its initial value (no container anywhere) the section is out of the state and the digest, so
 * a session that never dropped one saves and digests as before, and an older save restores with
 * none (#224's restored-section path). The portable form is the state's own shape, its cargo's
 * units in their JSON spelling (ticket 849), so the section stays v1: every body it wrote reads.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { corePlanetKeyOf } from '../../../systems/authority/planetCoreBays'
import {
  readSection,
  withSection,
  type SaveSection,
} from '../../../systems/registries/saveSections'
import { NO_PLACED_CONTAINERS, type PlacedContainers } from './placedContainers'
import {
  placedContainersOf,
  placedContainersProblems,
  toPortablePlacedContainers,
} from './placedContainersPortable'

export const CONTAINERS_SECTION: SaveSection<PlacedContainers> = {
  id: 'planet-kit.containers',
  version: 1,
  scope: 'session',
  initial: NO_PLACED_CONTAINERS,
  problems: placedContainersProblems,
  toPortable: toPortablePlacedContainers,
  ofPortable: placedContainersOf,
}

export function placedContainersIn(state: AuthorityState): PlacedContainers {
  return readSection(state, null, CONTAINERS_SECTION)
}

export function withPlacedContainers(
  state: AuthorityState,
  placed: PlacedContainers,
): AuthorityState {
  return withSection(state, null, CONTAINERS_SECTION, placed)
}

/** The session planet's `s:p`: where a drop lands and which containers a pickup can reach. */
export function sessionPlanetKeyOf(state: AuthorityState): string {
  return corePlanetKeyOf(state.planet)
}
