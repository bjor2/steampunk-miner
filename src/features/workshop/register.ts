/**
 * The workshop slice (ticket 177, spec #180): the Upgrade bay as a showcase of the car with track
 * plaques around it, hold-to-buy chains on G&V's curve, the part reactions and the turntable, and
 * the escalating purchase sound. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { workshopDebugActions } from './debug'
import { SHOWCASE_PART_MOTION } from './scene/showcaseParts'
import { PURCHASE_SOUND } from './systems/render/purchaseSound'
import { ShowcaseScreen } from './ui/ShowcaseScreen'

export const slice: SliceDefinition = {
  id: 'workshop',
  register(r) {
    // The Upgrade bay is open from the start, so the screen waits on no schedule row.
    r.bayScreen({
      id: 'workshop.showcase',
      bay: 'upgrade',
      featureId: null,
      Screen: ShowcaseScreen,
    })
    r.partMotionRequests(SHOWCASE_PART_MOTION)
    PURCHASE_SOUND.cues.forEach((cue) => r.soundCue(cue))
    // steampunkDebug.features.workshop.chainPreview('drill_power'), .holdBuy('engine', 10), .getChain()
    r.debugActions(workshopDebugActions)
  },
}
