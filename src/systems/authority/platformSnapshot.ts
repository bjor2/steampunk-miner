/**
 * The platform as a snapshot holds it (#11 section 3): the state's own shape, with each Refinery
 * batch's units in their JSON spelling (ticket 849), so a batch of any size crosses a save exactly.
 */
import { isJsonObject, isWholeNumber } from './payloadFields'
import { awayCoreBaysProblems, copyAwayCoreBays, withAwayCoreBays } from './planetCoreBays'
import { isPlatformVisualState, type PlatformState } from './platformState'
import {
  portableRefinerySlotsOf,
  refinerySlotsOfPortable,
  refinerySlotsProblems,
  type PortableRefinerySlot,
} from './refinery/refineryBatch'

export type PortablePlatform = Omit<PlatformState, 'refinerySlots'> & {
  refinerySlots: PortableRefinerySlot[]
}

export function portablePlatformOf(platform: PlatformState): PortablePlatform {
  const copied = { ...platform, refinerySlots: portableRefinerySlotsOf(platform.refinerySlots) }
  return withAwayCoreBays(copied, copyAwayCoreBays(platform.awayCoreBays ?? {}))
}

export function platformOfPortable(platform: PortablePlatform): PlatformState {
  const copied = { ...platform, refinerySlots: refinerySlotsOfPortable(platform.refinerySlots) }
  return withAwayCoreBays(copied, copyAwayCoreBays(platform.awayCoreBays ?? {}))
}

export function platformProblems(platform: unknown): string[] {
  const isValid =
    isJsonObject(platform) &&
    isWholeNumber(platform.coreBay) &&
    isPlatformVisualState(platform.visualState)
  if (!isValid) return ['snapshot.state.platform must hold a whole coreBay and a visual state']
  return [
    ...refinerySlotsProblems(platform.refinerySlots, 'snapshot.state.platform.refinerySlots'),
    ...awayCoreBaysProblems(platform.awayCoreBays, 'snapshot.state.platform.awayCoreBays'),
  ]
}
