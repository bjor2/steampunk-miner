/**
 * What the UI renders of the platform, copied from the authority (decision #3): the core bay
 * against the fragments travel needs (#33 `platform-core-bay`, `17 / 63`) and the visual state.
 * Rebuilt only when the authority's platform or planet changes, so a tick that leaves them alone
 * gives the same replica and no subscriber re-renders.
 */
import type { AuthorityState } from '../systems/authority/authorityState'
import { coreNeededOf } from '../systems/authority/coreBay'
import type { PlatformVisualState } from '../systems/authority/platformState'

export interface PlatformReplica {
  coreBay: number
  /** Null on a planet with no world (a debug planet 0). */
  coreNeeded: number | null
  visualState: PlatformVisualState
}

let lastSource: { platform: AuthorityState['platform']; planet: AuthorityState['planet'] } | null =
  null
let lastReplica: PlatformReplica | null = null

export function platformReplicaOf(state: AuthorityState): PlatformReplica {
  const isUnchanged = lastSource?.platform === state.platform && lastSource.planet === state.planet
  if (isUnchanged && lastReplica !== null) return lastReplica
  lastSource = { platform: state.platform, planet: state.planet }
  lastReplica = {
    coreBay: state.platform.coreBay,
    coreNeeded: coreNeededOf(state.planet),
    visualState: state.platform.visualState,
  }
  return lastReplica
}
