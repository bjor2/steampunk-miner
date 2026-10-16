/**
 * The power-up core slice (#200, spec #162 sections 2 and 4): the `power-up` content kind and its
 * charge classes, `use_power_up` with its wind-up and channel on the authority clock, the free
 * dock refill, the toggles' energy draw (ticket 233), the three slot cradles with their price and
 * card (ticket 248), the slot keys and the touch slot column, the power-up log lines, and the Mark
 * spend and effect report rows (#249). A consumable another slice registers a `consumable-restock`
 * for is bought back by the charge at the Upgrade bay (ticket 394): the restock command and its
 * bay entries. It does not own the loadout (TD, #162). No side effects at
 * import; the loader calls `register`.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { powerUpCoreDebugActions } from './debug'
import { POWER_UP_PROJECTIONS, POWER_UP_RUN_EVENTS } from './logging'
import { MARK_REPORT_ROWS } from './markReportRows'
import { POWER_UP_SECTION } from './systems/chargeState'
import { CRADLE_CARDS, CRADLE_SELLER } from './systems/cradleSales'
import { CRADLES } from './systems/cradles'
import { REFILL_CHARGES_SERVICE } from './systems/dockRefill'
import { POWER_UP_RULES } from './systems/powerUpCommands'
import { RESTOCK_BAY_ENTRIES } from './systems/restockBayEntries'
import { RESTOCK_RULES } from './systems/restockRules'
import { SLOT_USE_REACTIONS } from './systems/slotUse'
import { DRAW_TOGGLES_STEP } from './systems/toggleDraw'
import { RESOLVE_USES_STEP } from './systems/useClock'
import { SLOT_TOUCH_BINDINGS } from './ui/slotTouchBindings'

export const slice: SliceDefinition = {
  id: 'power-up-core',
  register(r) {
    r.content('vehicle-item', CRADLES)
    // Each cradle on sale at the Upgrade bay once its node is researched, with its card (ticket 248).
    r.vehicleItemSeller(CRADLE_SELLER)
    r.itemDescriptionEntries(CRADLE_CARDS)
    r.saveSection(POWER_UP_SECTION)
    r.commandRules(POWER_UP_RULES)
    r.commandRules(RESTOCK_RULES)
    r.bayEntry(RESTOCK_BAY_ENTRIES)
    r.clockStep(DRAW_TOGGLES_STEP)
    r.clockStep(RESOLVE_USES_STEP)
    r.dockService(REFILL_CHARGES_SERVICE)
    SLOT_USE_REACTIONS.forEach((reaction) => r.inputReaction(reaction))
    r.eventProjections(POWER_UP_PROJECTIONS)
    r.runEvents(POWER_UP_RUN_EVENTS)
    r.reportRows(MARK_REPORT_ROWS)
    // The touch slot column, one tap row per tile it draws (#474).
    SLOT_TOUCH_BINDINGS.forEach((row) => r.touchBinding(row))
    // steampunkDebug.features['power-up-core'].getSlots() / .getCharges(id) / .setCharges(id, n) /
    // .holdSlot(slot)
    r.debugActions(powerUpCoreDebugActions)
  },
}
