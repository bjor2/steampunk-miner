/**
 * The power-up core slice (#200, spec #162 sections 2 and 4): the `power-up` content kind and its
 * charge classes, `use_power_up` with its wind-up and channel on the authority clock, the free
 * dock refill, the slot keys and the touch slot column, and the power-up log lines. It does not
 * own the loadout (TD, #162). No side effects at import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { powerUpCoreDebugActions } from './debug'
import { POWER_UP_PROJECTIONS, POWER_UP_RUN_EVENTS } from './logging'
import { POWER_UP_SECTION } from './systems/chargeState'
import { REFILL_CHARGES_SERVICE } from './systems/dockRefill'
import { POWER_UP_RULES } from './systems/powerUpCommands'
import { SLOT_USE_REACTIONS } from './systems/slotUse'
import { RESOLVE_USES_STEP } from './systems/useClock'
import { SlotColumn } from './ui/SlotColumn'

/** Everything the slice registers; the slice's specs load it beside their fake items. */
export const wiredSlice: SliceDefinition = {
  id: 'power-up-core',
  register(r) {
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

/**
 * Registers nothing yet (needs-planner on #200): the first registered player section makes every
 * save written before it unloadable (a missing section is refused, `sliceSectionSnapshot.ts`),
 * and the cradle rows need bare catalogue ids the registrar refuses. `slice` becomes `wiredSlice`
 * once the kernel answers both.
 */
export const slice: SliceDefinition = {
  id: 'power-up-core',
  register() {},
}
