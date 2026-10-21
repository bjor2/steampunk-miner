/**
 * The side cutters' width Marks (GD lock on #308, ticket 620, on the TD's shape and Systems' price
 * rows): Mark 1 is the side cutters themselves (`sideCells` 1); each later Mark is a part the
 * vehicle owns, with no slot of its own, that widens the switched-on cutters to its `sideCells`
 * (Mark 2: 2, so Wide's reamers on top make 3). Width is yield and clearing, never speed: each side
 * cell pays the kernel's side ore share and its whole energy and heat. A further Mark is one more
 * row here and in `items.balance`.
 *
 * Priced by money alone: Mark n is the lane's one-off, `15 V(3(a_n - 1) + 5) paceScale(a_n)` with
 * the price anchor `a_n = 13 + 3(n - 1)` (Mark 2 at 16), never a planet lock (#411) and no cap on
 * the cells. Its node needs the Mark 1 node and the side cutters owned, as nothing else could
 * carry the cutters it widens.
 */
import type { Money } from '../../../systems/money'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import type { VehicleItemOffer } from '../../../systems/registries/vehicleItemSales'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { isItemOwned, type VehicleLoadout } from '../../../systems/vehicle/loadoutState'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import type { TechNode } from '../../tech-tree'
import { widthLineSpecsOf } from './boreWidthCopy'
import { DRILL_GEAR_ECONOMY } from './drillGearEconomy'
import type { DrillGearNode } from './drillGearItems'

export const SIDE_CUTTERS_MARK_2_ID = 'gear.side_cutters_mark_2'

/** The side cutters' own item and node, which every width Mark widens and needs. */
const SIDE_CUTTERS_ITEM_ID = 'gear.side_cutters'
const SIDE_CUTTERS_NODE_ID = 'tech.drill_gear.side_cutters'

/** One width Mark past the cutters' own: an owned part, priced at its node's anchor. */
export interface SideCutterMark {
  mark: number
  itemId: string
  /** Sentence case hardware; not "Mark 2", which the tree's research Marks already print. */
  name: string
  iconId: string
  /** The flavour line: no digits, at most 80 characters, never "rig" (#162 acceptance 1, 2). */
  description: string
  node: DrillGearNode
}

export const SIDE_CUTTER_MARKS: readonly SideCutterMark[] = [
  {
    mark: 2,
    itemId: SIDE_CUTTERS_MARK_2_ID,
    name: 'Double side cutters',
    // The side cutters' icons until the drill-type art (#622) draws this part.
    iconId: 'item-gear-side-cutters',
    description: 'A second gear train doubles the flank cutters and widens the bore.',
    node: {
      id: 'tech.drill_gear.side_cutters_mark_2',
      iconId: 'node-drill-gear-side-cutters',
      unlockTier: 16,
      prereqs: [SIDE_CUTTERS_NODE_ID],
    },
  },
]

/** The side cells the widest width Mark the vehicle owns asks; null while it owns none. */
export function ownedSideCutterCellsOf(loadout: VehicleLoadout): number | null {
  const owned = SIDE_CUTTER_MARKS.filter((mark) => isItemOwned(loadout, mark.itemId))
  return owned.length === 0 ? null : Math.max(...owned.map(sideCellsOfMark))
}

/** The side cells of the widest width Mark the lane sells. */
export function widestSideCutterCells(): number {
  return Math.max(...SIDE_CUTTER_MARKS.map(sideCellsOfMark))
}

/** The width Mark sold as `itemId`, or null for any other item. */
export function sideCutterMarkOf(itemId: string): SideCutterMark | null {
  return SIDE_CUTTER_MARKS.find((mark) => mark.itemId === itemId) ?? null
}

/** The `items.balance` side cells of a width Mark; a missing row is a broken file. */
export function sideCellsOfMark(mark: SideCutterMark): number {
  const cells = DRILL_GEAR_ECONOMY.balance[mark.itemId]?.sideCells
  if (cells === undefined) throw new RangeError(`items.balance.${mark.itemId} has no sideCells`)
  return cells
}

/** The lane's one-off at the Mark's anchor (#162 4.1), the same number on every planet. */
export function sideCutterMarkPriceOf(mark: SideCutterMark): Money {
  const anchor = mark.node.unlockTier
  return bandOrePriceAt(DRILL_GEAR_ECONOMY.price, anchor, anchor)
}

/** Owned, never slotted: the cutters it widens sit in the flank. */
export function vehicleItemOfMark(mark: SideCutterMark): VehicleItem {
  return { id: mark.itemId, iconId: mark.iconId, slots: [], attach: null }
}

export function techNodeOfMark(mark: SideCutterMark): TechNode {
  return {
    id: mark.node.id,
    iconId: mark.node.iconId,
    lane: 'drill-gear',
    name: mark.name,
    unlockTier: mark.node.unlockTier,
    prereqs: mark.node.prereqs,
    requiresOwned: [SIDE_CUTTERS_ITEM_ID],
    unlocks: mark.itemId,
    description: mark.description,
    label: 'horizontal',
    costKind: 'capability',
  }
}

export function offerOfMark(mark: SideCutterMark): VehicleItemOffer {
  return { name: mark.name, price: sideCutterMarkPriceOf(mark) }
}

/**
 * Its card: the side cells it cuts, its bore width and ore gain (ticket 621) and its price, none
 * stepping (it has no Marks of its own).
 */
export function cardOfMark(mark: SideCutterMark): ItemDescriptionEntry {
  return {
    id: `drill-gear.${mark.itemId.slice('gear.'.length)}`,
    matches: { kind: 'vehicle-item', id: mark.itemId },
    flavour: mark.description,
    statLines: [
      sideCellsLineOf(mark),
      ...widthLineSpecsOf(sideCellsOfMark(mark)),
      priceLineOf(mark),
    ],
  }
}

function sideCellsLineOf(mark: SideCutterMark): DescribedStatLineSpec {
  return {
    label: 'Side cells (cells)',
    kind: 'linearInt',
    value: () => sideCellsOfMark(mark),
    nextLevel: hasNoNextLevel,
  }
}

function priceLineOf(mark: SideCutterMark): DescribedStatLineSpec {
  return {
    label: 'Price',
    kind: 'geometric',
    value: () => sideCutterMarkPriceOf(mark),
    nextLevel: hasNoNextLevel,
  }
}
