/**
 * The registry rows a combo catalogue row makes (#161 sections 1 and 2, #162 section 1): the
 * `vehicle-item` (no slot and no attach id: a combo mounts nothing new), the authored grade-1
 * `tech-node` (lane `combo`, cost kind `combo`, no Marks), the lane pair's `tech-combo-template`,
 * and the one-off price at the unlock planet (#162 4.1).
 */
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { Money } from '../../../systems/money'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { RESEARCH_LAB_ROW_ID, type TechComboTemplate, type TechNode } from '../../tech-tree'
import { COMBO_ITEMS, type ComboItem, type ComboNode } from './comboCatalogue'
import { COMBOS_ECONOMY } from './combosEconomy'

const COMBO_ID_PREFIX = 'combo.'
const TEMPLATE_ID_PREFIX = 'tech.template.'
const NODE_ICON_PREFIX = 'node-combo-'

export function vehicleItemOf(item: ComboItem): VehicleItem {
  return { id: item.itemId, iconId: item.iconId, slots: [], attach: null }
}

/** The authored grade-1 node of a combo that has one: both parent items owned (GD lock on #206). */
export function techNodeOf(item: ComboItem, node: ComboNode): TechNode {
  return {
    id: node.id,
    iconId: node.iconId,
    lane: 'combo',
    name: item.name,
    unlockTier: node.unlockTier,
    prereqs: item.parents,
    requiresOwned: item.parentItemIds,
    ...anchorGateOf(item),
    unlocks: item.itemId,
    description: item.description,
    label: 'horizontal',
    costKind: 'combo',
  }
}

/** Every authored combo node, earliest first. */
export function authoredComboNodesOf(items: readonly ComboItem[]): TechNode[] {
  return items.flatMap((item) => (item.node === null ? [] : [techNodeOf(item, item.node)]))
}

/** The lane pair's template: `tech.template.<name>`, ids as `COMBO_TEMPLATES_FIXTURE` has them. */
export function comboTemplateOf(
  row: Pick<
    ComboItem,
    'itemId' | 'name' | 'description' | 'lanes' | 'parents' | 'parentItemIds' | 'anchorRowIds'
  >,
): TechComboTemplate {
  const name = row.itemId.slice(COMBO_ID_PREFIX.length)
  return {
    id: `${TEMPLATE_ID_PREFIX}${name}`,
    iconId: `${NODE_ICON_PREFIX}${name.replaceAll('_', '-')}`,
    lanes: row.lanes,
    name: row.name,
    unlocks: row.itemId,
    parents: row.parents,
    description: row.description,
    requiresOwned: row.parentItemIds,
    ...anchorGateOf(row),
  }
}

/**
 * A weapon x lane combo's `requiresFeature`: the `research_lab` row and its anchors (GD decision
 * on #310), so the node and every grade stay hidden and refused until all are unlocked; nothing
 * for a combo of the six lanes, which the lab gates through its `no_lab` refusal alone.
 */
function anchorGateOf(row: Pick<ComboItem, 'anchorRowIds'>): { requiresFeature?: string[] } {
  if (row.anchorRowIds === undefined) return {}
  return { requiresFeature: [RESEARCH_LAB_ROW_ID, ...row.anchorRowIds] }
}

/**
 * The fifteen templates, one per lane pair of the six lanes (#161 section 2; ticket 206 "Combo
 * templates"; the GD lock on #245 and the aetheric pairs of ticket 373), then the three weapon x
 * lane templates (ticket 320).
 */
export const COMBO_TEMPLATES: readonly TechComboTemplate[] = COMBO_ITEMS.map(comboTemplateOf)

/**
 * The one-off price (#162 4.1): `k` band-5 ore priced at the planet the combo unlocks on, with
 * its `paceScale`: the authored node's tier, or `41 + 3j` for a generated grade.
 */
export function comboPriceAt(unlockPlanet: number): Money {
  return bandOrePriceAt(COMBOS_ECONOMY.price, unlockPlanet, unlockPlanet)
}
