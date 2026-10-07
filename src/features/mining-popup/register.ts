/**
 * The mining popup slice (#178, spec #172): a chip for each ore type the drill brings into the
 * hold, on the HUD overlay beside the vehicle, and the tier-0 "NEW MATERIAL" plaque in the banner
 * slot on the first mine of a type. It renders the authority's events and the codex's discoveries
 * only: no section, no command, no log line. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { miningPopupDebugActions } from './debug'
import { NewMaterialPlaque } from './ui/NewMaterialPlaque'
import { ResourceChips } from './ui/ResourceChips'

/** Chips are glanceable and short-lived: a full overlay drops them before higher-priority cards. */
const CHIP_OVERLAY_PRIORITY = 10

export const slice: SliceDefinition = {
  id: 'mining-popup',
  register(r) {
    r.hudPanel({
      id: 'mining-popup.chips',
      slot: 'overlay',
      priority: CHIP_OVERLAY_PRIORITY,
      Panel: ResourceChips,
    })
    r.hudPanel({ id: 'mining-popup.plaque', slot: 'banner', Panel: NewMaterialPlaque })
    // steampunkDebug.features['mining-popup'].getShown()
    r.debugActions(miningPopupDebugActions)
  },
}
