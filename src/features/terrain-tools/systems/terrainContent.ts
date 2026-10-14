/**
 * The shipped terrain tools as the kernel and `tech-tree` take them: one `vehicle-item` per tool
 * (slot acceptance and one attach point, #162 acceptance 1), one `tech.terrain.*` node each plus
 * the fourth cradle's (ticket 251) and the two new terrain magnets' (ticket 300), and their item
 * cards (#159, the K7 `itemDescriptionEntries` seam): the #162 flavour line, one line per
 * `statPreview` line read at the Mark the card's level names, and the price last. A card at level 0 reads Mark 1, the item as bought; its next value is
 * the next Mark until it is Mastered. A shipped terrain magnet (ticket 284) registers its item and
 * Content's card (`magnetCards.ts`) the same way. Stabiliser foam's card (ticket 381) carries
 * Content's lines in place of the stat lines, its Charges line standing for the stack, then its
 * price per unit as every consumable's card does.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { div, fromSafeInteger, type Money } from '../../../systems/money'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt, milestoneLineSpecsOf, type TechNode } from '../../tech-tree'
import { SHIPPED_MAGNET_ITEMS, SHIPPED_TERRAIN_ITEMS } from './shippedTools'
import { foamLineSpecs } from './foamCards'
import { magnetCardOf } from './magnetCards'
import { MAGNET_ITEMS, magnetTechNodeOf, magnetVehicleItemOf } from './magnetItems'
import { FOURTH_CRADLE_NODE } from './terrainCradle'
import { STABILISER_FOAM_ID } from './stabiliserFoam'
import { TERRAIN_FORK } from './terrainFork'
import { statPreview, type TerrainStatLine, type TerrainStatUnit } from './statPreview'
import {
  isConsumable,
  itemPriceOf,
  markLadderOf,
  techNodeOf,
  terrainItemOf,
  vehicleItemOf,
  type TerrainItem,
} from './terrainItems'

const FIRST_MARK = 1
/** Any planet: a tool's stat lines are the same on every one. */
const LABEL_PLANET = 1

/** Ticks read as seconds on a card; the other units as whole counts. */
const UNIT_SUFFIX: Readonly<Record<TerrainStatUnit, string>> = {
  ticks: ' (s)',
  tiles: ' (tiles)',
  cells: ' (cells)',
  charges: '',
  units: '',
  swaps: '',
}

/** A tool whose card carries Content's own lines in place of its stat lines. */
const AUTHORED_LINES: Readonly<Record<string, () => DescribedStatLineSpec[]>> = {
  [STABILISER_FOAM_ID]: foamLineSpecs,
}

export const TERRAIN_VEHICLE_ITEMS: readonly VehicleItem[] = [
  ...SHIPPED_TERRAIN_ITEMS.map(vehicleItemOf),
  ...SHIPPED_MAGNET_ITEMS.map(magnetVehicleItemOf),
]

/**
 * The tools' nodes, the fourth cradle's (ticket 251), the magnets' (ticket 300) and the P16 fork's
 * two branches (ticket 269), researched passives that add no vehicle item.
 */
export const TERRAIN_TECH_NODES: readonly TechNode[] = [
  ...SHIPPED_TERRAIN_ITEMS.map(techNodeOf),
  FOURTH_CRADLE_NODE,
  ...MAGNET_ITEMS.map(magnetTechNodeOf),
  ...TERRAIN_FORK.branches,
]

export const TERRAIN_ITEM_CARDS: readonly ItemDescriptionEntry[] = [
  ...SHIPPED_TERRAIN_ITEMS.map(cardOf),
  ...SHIPPED_MAGNET_ITEMS.map(magnetCardOf),
]

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
export function markOfLevel(level: number): number {
  return Math.max(FIRST_MARK, level)
}

function cardOf(item: TerrainItem): ItemDescriptionEntry {
  return {
    id: `terrain-tools.${item.itemId.slice(item.itemId.indexOf('.') + 1)}`,
    matches: { kind: 'vehicle-item', id: item.itemId },
    flavour: item.description,
    statLines: [
      ...statLineSpecsOf(item),
      ...milestoneLineSpecsOf(markLadderOf(item)),
      priceLineSpecOf(item),
    ],
  }
}

/** One line per stat preview line, or Content's own lines where it wrote them. */
function statLineSpecsOf(item: TerrainItem): DescribedStatLineSpec[] {
  const authored = AUTHORED_LINES[item.itemId]
  if (authored !== undefined) return authored()
  const lines = statPreview(item.itemId, FIRST_MARK, LABEL_PLANET)?.lines ?? []
  return lines.map(markLineSpecOf)
}

/** A stat the Marks step, in player units: its next value is the next Mark's. */
function markLineSpecOf(line: TerrainStatLine, index: number): DescribedStatLineSpec {
  return {
    label: `${line.label}${UNIT_SUFFIX[line.unit]}`,
    kind: 'linearInt',
    value: (ref, ctx) => cardValueOf(previewLineAt(ref, ctx, index)),
    nextLevel: nextMarkOf,
  }
}

/** A charged tool's price is fixed at its unlock planet; a consumable's is per unit, here. */
function priceLineSpecOf(item: TerrainItem): DescribedStatLineSpec {
  return {
    label: isConsumable(item) ? 'Price per unit' : 'Price',
    kind: 'geometric',
    value: (ref, ctx) => itemPriceOf(cardItemOf(ref), ctx.planetIndex),
    nextLevel: hasNoNextLevel,
  }
}

function cardValueOf(line: TerrainStatLine | undefined): number | Money {
  if (line === undefined) return 0
  if (line.unit !== 'ticks') return line.value
  return div(fromSafeInteger(line.value), fromSafeInteger(TICKS_PER_SECOND))
}

function previewLineAt(ref: ItemRef, ctx: ItemCtx, index: number): TerrainStatLine | undefined {
  return statPreview(ref.id, markOfLevel(ctx.level), ctx.planetIndex)?.lines[index]
}

function nextMarkOf(ref: ItemRef, ctx: ItemCtx): number | null {
  const mark = markOfLevel(ctx.level)
  return isMasteredAt(markLadderOf(cardItemOf(ref)), mark) ? null : mark + 1
}

function cardItemOf(ref: ItemRef): TerrainItem {
  const item = terrainItemOf(ref.id)
  if (item === null) throw new RangeError(`no terrain card for ${ref.id}`)
  return item
}
