/**
 * What the UI renders of the platform, copied from the authority (decision #3): the core bay
 * against the fragments travel needs (#33 `platform-core-bay`, `17 / 63`), the visual state, and
 * the Refinery bay's look where the platform has it (#105: a batch turns ready on the clock, so the
 * look is read at the tick). Rebuilt only when the authority's platform, planet or that look
 * changes, so a tick that leaves them alone gives the same replica and no subscriber re-renders.
 */
import type { AuthorityState } from '../systems/authority/authorityState'
import { coreNeededOf } from '../systems/authority/coreBay'
import type { PlatformVisualState } from '../systems/authority/platformState'
import { hasRefineryOn } from '../systems/authority/refinery/refineryFacility'
import { refineryBayLookOf, type RefineryBayLook } from '../systems/render/refineryBayLook'

export interface PlatformReplica {
  coreBay: number
  /** Null on a planet with no world (a debug planet 0). */
  coreNeeded: number | null
  visualState: PlatformVisualState
  /** Null before the platform has the Refinery bay. */
  refineryLook: RefineryBayLook | null
}

let lastSource: { platform: AuthorityState['platform']; planet: AuthorityState['planet'] } | null =
  null
let lastReplica: PlatformReplica | null = null

export function platformReplicaOf(state: AuthorityState): PlatformReplica {
  const refineryLook = refineryLookOf(state)
  const isUnchanged = lastSource?.platform === state.platform && lastSource.planet === state.planet
  if (isUnchanged && lastReplica?.refineryLook === refineryLook) return lastReplica
  lastSource = { platform: state.platform, planet: state.planet }
  lastReplica = {
    coreBay: state.platform.coreBay,
    coreNeeded: coreNeededOf(state.planet),
    visualState: state.platform.visualState,
    refineryLook,
  }
  return lastReplica
}

function refineryLookOf(state: AuthorityState): RefineryBayLook | null {
  if (!hasRefineryOn(state.planet.index)) return null
  return refineryBayLookOf(state.platform.refinerySlots, state.tick)
}
