/**
 * The power-up core slice (#200, spec #162 sections 2 and 4): the `power-up` content kind and its
 * charge classes, `use_power_up` with its wind-up and channel on the authority clock, the free
 * dock refill, the three slot cradles, the slot keys and the touch slot column, and the power-up
 * log lines. It does not own the loadout (TD, #162). No side effects at import; the loader calls
 * `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { powerUpCoreDebugActions } from './debug'
import { POWER_UP_PROJECTIONS, POWER_UP_RUN_EVENTS } from './logging'
import { POWER_UP_SECTION } from './systems/chargeState'
import { CRADLES } from './systems/cradles'
import { REFILL_CHARGES_SERVICE } from './systems/dockRefill'
import { POWER_UP_RULES } from './systems/powerUpCommands'
import { SLOT_USE_REACTIONS } from './systems/slotUse'
import { RESOLVE_USES_STEP } from './systems/useClock'
import { SlotColumn } from './ui/SlotColumn'

export const slice: SliceDefinition = {
  id: 'power-up-core',
  register(r) {
    r.content('vehicle-item', CRADLES)
    r.saveSection(POWER_UP_SECTION)
    r.commandRules(POWER_UP_RULES)
    r.clockStep(RESOLVE_USES_STEP)
    r.dockService(REFILL_CHARGES_SERVICE)
    SLOT_USE_REACTIONS.forEach((reaction) => r.inputReaction(reaction))
    r.eventProjections(POWER_UP_PROJECTIONS)
    r.runEvents(POWER_UP_RUN_EVENTS)
    r.hudPanel({ id: 'power-up-core.slot-column', slot: 'slots', Panel: SlotColumn })
    // steampunkDebug.features['power-up-core'].getSlots() / .getCharges(id) / .setCharges(id, n)
    r.debugActions(powerUpCoreDebugActions)
  },
}
