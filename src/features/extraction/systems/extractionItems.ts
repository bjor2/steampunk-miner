/**
 * The extraction lane's store items (spec #162 section 1, the extractors table; #161 section 1 for
 * the tree nodes): the mineral drain and the slurry siphon, as catalogue rows, and the
 * `vehicle-item` rows, tech nodes and prices made from them. The extractors themselves belong to
 * `mining-gates` (#142), the drain combos to the tree.
 *
 * Vision rows (ticket 239, the data half of #201): nothing here is registered, so no store, tree,
 * item card or bot sees them; #201 registers them with the effect.
 */
import type { Money } from '../../../systems/money'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { ItemAttach } from '../../../systems/registries/vehicleAttach'
import type { LoadoutSlotId, VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { POWER_UP_SLOTS, type PowerUpClass } from '../../power-up-core'
import type { MarkLadder, ProgressionLabel, TechNode } from '../../tech-tree'
import { EXTRACTION_ECONOMY, type ExtractionBalance } from './extractionEconomy'

/** One store item of the lane, as #162 and #161 write it. */
export interface ExtractionItem {
  /** The bare catalogue id (#224), shared by the store, the tree and the descriptions. */
  itemId: string
  /** Sentence case: other hardware, not a named extractor (#159 naming ruling). */
  name: string
  iconId: string
  /** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
  description: string
  label: ProgressionLabel
  powerUpClass: Extract<PowerUpClass, 'charged' | 'channel'>
  /** Both items move ore, so both take the tighter Mark floor and cap (#162 4.6). */
  isIncomeItem: boolean
  slots: readonly LoadoutSlotId[]
  /** No signature part: drawn at its slot's `hull.powerup.n` (TD socket amendments on #162). */
  attach: ItemAttach
  /** What `actTicks` and `reachTiles` mean for this item, as a card names them. */
  actLabel: string
  reachLabel: string
  node: ExtractionNode
}

/** The item's capability node (#161 section 1). */
export interface ExtractionNode {
  id: string
  iconId: string
  /** The unlock planet; the item's one-off price is read there too (#162 4.1). */
  unlockTier: number
  prereqs: readonly string[]
}

export const EXTRACTION_ITEMS: readonly ExtractionItem[] = [
  {
    itemId: 'power.mineral_drain',
    name: 'Mineral drain',
    iconId: 'item-power-mineral-drain',
    description: 'Galvanic leads coax dissolved ore through brine seams into a settling tank.',
    label: 'horizontal',
    powerUpClass: 'channel',
    isIncomeItem: true,
    slots: POWER_UP_SLOTS,
    attach: 'slot',
    actLabel: 'Channel',
    reachLabel: 'Radius',
    node: {
      id: 'tech.extraction.mineral_drain',
      iconId: 'node-extraction-mineral-drain',
      unlockTier: 9,
      prereqs: ['tech.extraction.resonance_fork'],
    },
  },
  {
    itemId: 'power.slurry_siphon',
    name: 'Slurry siphon',
    iconId: 'item-power-slurry-siphon',
    description: 'A steam ejector pump sucks ore-laden slurry up a brass hose.',
    label: 'horizontal',
    powerUpClass: 'charged',
    isIncomeItem: true,
    slots: POWER_UP_SLOTS,
    attach: 'slot',
    actLabel: 'Wind-up',
    reachLabel: 'Line',
    node: {
      id: 'tech.extraction.slurry_siphon',
      iconId: 'node-extraction-slurry-siphon',
      unlockTier: 16,
      prereqs: ['tech.extraction.mineral_drain'],
    },
  },
]

/** The catalogue row of `itemId`, or null for an item of another lane. */
export function extractionItemOf(itemId: string): ExtractionItem | null {
  return EXTRACTION_ITEMS.find((item) => item.itemId === itemId) ?? null
}

/** The item's `items.balance.<id>` row; every item here has one (the spec says so). */
export function balanceOf(item: ExtractionItem): ExtractionBalance {
  const balance = EXTRACTION_ECONOMY.balance[item.itemId]
  if (balance === undefined) throw new RangeError(`no items.balance row for ${item.itemId}`)
  return balance
}

export function vehicleItemOf(item: ExtractionItem): VehicleItem {
  return { id: item.itemId, iconId: item.iconId, slots: item.slots, attach: item.attach }
}

/** The Mark 1 ladder: cooldown, then cells per use, then charges (#162 4.6, the #165 rotation). */
export function markLadderOf(item: ExtractionItem): MarkLadder {
  const balance = balanceOf(item)
  return {
    isIncomeItem: item.isIncomeItem,
    cooldown: balance.cooldownTicks,
    magnitude: { base: balance.cellsPerUse },
    charges: balance.charges,
  }
}

export function techNodeOf(item: ExtractionItem): TechNode {
  return {
    id: item.node.id,
    iconId: item.node.iconId,
    lane: 'extraction',
    name: item.name,
    unlockTier: item.node.unlockTier,
    prereqs: item.node.prereqs,
    unlocks: item.itemId,
    description: item.description,
    label: item.label,
    costKind: 'capability',
    marks: markLadderOf(item),
  }
}

/**
 * The one-off price (#162 4.1): `k` band-5 ore priced at the unlock planet, with its `paceScale`,
 * so the card shows one fixed number on every planet.
 */
export function itemPriceOf(item: ExtractionItem): Money {
  const unlockPlanet = item.node.unlockTier
  return bandOrePriceAt(EXTRACTION_ECONOMY.price, unlockPlanet, unlockPlanet)
}
