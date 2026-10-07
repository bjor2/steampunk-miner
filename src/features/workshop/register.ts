/**
 * The workshop slice (ticket 177, spec #180): the Workshop redo's hold-to-buy chain, its purchase
 * sound and the chain preview. Today it registers only the read-only preview; the chain
 * controller, the plaques, the showcase layer and the sound wait on the kernel's
 * `buyUpgrade {chain}` and Upgrade bay seams. No side effects at import; the loader calls
 * `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { workshopDebugActions } from './debug'

export const slice: SliceDefinition = {
  id: 'workshop',
  register(r) {
    // steampunkDebug.features.workshop.chainPreview('drill_power')
    r.debugActions(workshopDebugActions)
  },
}
