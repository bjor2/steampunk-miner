/**
 * The rig look slice (#577; spec #576, G&V on #157, TD shape on #577): every purchase on an upgrade
 * track visibly changes the rig. One table, `rigLook.json`, holds each track's look steps and its
 * linear tail; one vehicle look source per row block paints them through the kernel's
 * `vehicleLooks`, and one part motion source swaps in the steps' parts on each track's own attach
 * point, yielding it to a fitted module. Cosmetic only: no command, event, log line, save section,
 * codex entry or stat. No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { rigLookDebugActions } from './debug'
import { RIG_LOOK_PART_SWAPS } from './scene/rigLookPartSwaps'
import { createRigLookSources } from './systems/rigLookSource'

export const slice: SliceDefinition = {
  id: 'rig-look',
  register(r) {
    for (const source of createRigLookSources()) r.vehicleLook(source)
    r.partMotionRequests(RIG_LOOK_PART_SWAPS)
    // steampunkDebug.features['rig-look'].getLooks()
    r.debugActions(rigLookDebugActions)
  },
}
