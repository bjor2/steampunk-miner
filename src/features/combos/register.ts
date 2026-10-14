/**
 * The combos slice's registration (ticket 206 as 206b, spec #162; GD lock on #206): no side
 * effects at import; the loader calls `register`.
 *
 * The shipped combos (`systems/comboContent.ts`): each one's `vehicle-item` row, its authored
 * grade-1 node (P15-P28, researched at the `research_lab` with both parents owned), its pair's
 * template the tree grades it on from (P41 on), its card and its sale at the Upgrade bay; their
 * item hooks on the drain, the ore-shifter, the corer and the steam shield; and the `combos`
 * section the cored drain keeps the corer's last plug in, with the reaction that writes it. The
 * held combos (`systems/comboHolds.ts`) stay vision rows. No lane slice is imported.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { comboCardOf } from './systems/comboCards'
import {
  COMBO_TECH_NODES,
  COMBO_VEHICLE_ITEMS,
  SHIPPED_COMBO_TEMPLATES,
  SHIPPED_COMBOS,
} from './systems/comboContent'
import { COMBO_HOOKS } from './systems/comboHooks'
import { COMBO_SELLER } from './systems/comboSales'
import { COMBO_SECTION, SAMPLED_VEIN_REACTION } from './systems/sampledVein'

export const slice: SliceDefinition = {
  id: 'combos',
  register(r) {
    r.content('vehicle-item', COMBO_VEHICLE_ITEMS)
    r.content('tech-node', COMBO_TECH_NODES)
    r.content('tech-combo-template', SHIPPED_COMBO_TEMPLATES)
    r.itemDescriptionEntries(SHIPPED_COMBOS.map(comboCardOf))
    r.vehicleItemSeller(COMBO_SELLER)
    COMBO_HOOKS.forEach((hook) => r.itemHook(hook))
    r.saveSection(COMBO_SECTION)
    r.authorityReaction(SAMPLED_VEIN_REACTION)
  },
}
