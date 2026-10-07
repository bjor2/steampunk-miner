/**
 * The workshop slice (ticket 177, spec #180): the Workshop redo's hold-to-buy chain, its
 * escalating purchase sound and the chain preview. No side effects at import; the loader calls
 * `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { workshopDebugActions } from './debug'
import { PURCHASE_SOUND } from './systems/render/purchaseSound'

export const slice: SliceDefinition = {
  id: 'workshop',
  register(r) {
    PURCHASE_SOUND.cues.forEach((cue) => r.soundCue(cue))
    // steampunkDebug.features.workshop.chainPreview('drill_power')
    r.debugActions(workshopDebugActions)
  },
}
