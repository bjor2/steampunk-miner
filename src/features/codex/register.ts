/**
 * The codex slice (#207, from the #178 and #207 TD locks): per-player discovery state. Its section
 * is written only by its authority reaction, the kernel `discovery` query answers from it, and its
 * `codex.*` events land in the same answer as the touch or unit that caused them. No side effects at
 * import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { codexDebugActions } from './debug'
import { CODEX_PROJECTIONS, CODEX_RUN_EVENTS } from './logging'
import { CODEX_DISCOVERY_REACTION } from './systems/codexReaction'
import { CODEX_DISCOVERY_PROVIDER } from './systems/codexReads'
import { CODEX_SECTION } from './systems/codexSection'

export const slice: SliceDefinition = {
  id: 'codex',
  register(r) {
    r.saveSection(CODEX_SECTION)
    r.discovery(CODEX_DISCOVERY_PROVIDER)
    r.authorityReaction(CODEX_DISCOVERY_REACTION)
    r.eventProjections(CODEX_PROJECTIONS)
    r.runEvents(CODEX_RUN_EVENTS)
    // steampunkDebug.features.codex.getCodex()
    r.debugActions(codexDebugActions)
  },
}
