/**
 * The workshop slice (ticket 177, spec #180): the Upgrade bay as a showcase of the car, with what
 * it sells as the Outfitter on the base sheet (spec #678, ticket 687), the hold-to-buy chains on
 * G&V's curve (driven by the debug API since the plaques left), the part reactions and the
 * turntable, and the escalating purchase sound. No side effects at import; the loader calls
 * `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { workshopDebugActions } from './debug'
import { SHOWCASE_PART_MOTION } from './scene/showcaseParts'
import { PURCHASE_SOUND } from './systems/render/purchaseSound'
import { OUTFITTER_TAB } from './ui/outfitterTab'
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
    r.sheetTab(OUTFITTER_TAB)
    r.partMotionRequests(SHOWCASE_PART_MOTION)
    PURCHASE_SOUND.cues.forEach((cue) => r.soundCue(cue))
    // steampunkDebug.features.workshop.chainPreview('drill_power'), .holdBuy('engine', 10), .getChain()
    r.debugActions(workshopDebugActions)
  },
}
