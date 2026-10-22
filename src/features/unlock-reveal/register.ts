/**
 * The unlock reveal slice (ticket 718, spec #678 Progression 1): the first buy of a new capability
 * (the kernel's shared flag: a vehicle item, the turret's mount, the bore gun's mount) plays a
 * short brass plate on the dock while the part glows where it is fitted on the car, the phone's
 * full sheet stepping aside so the car shows. A tap skips it. Presentation only: it hears the
 * authority's buys and never submits. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { unlockRevealDebugActions } from './debug'
import { REVEAL_HANG, REVEAL_LOOK } from './scene/revealOnRigSources'
import { UnlockRevealPlate } from './ui/UnlockRevealPlate'

export const slice: SliceDefinition = {
  id: 'unlock-reveal',
  register(r) {
    r.bayPanel({ id: 'unlock-reveal.plate', slot: 'above', Panel: UnlockRevealPlate })
    r.vehicleLook(REVEAL_LOOK)
    r.partMotionRequests(REVEAL_HANG)
    // steampunkDebug.features['unlock-reveal'].getReveal()
    r.debugActions(unlockRevealDebugActions)
  },
}
