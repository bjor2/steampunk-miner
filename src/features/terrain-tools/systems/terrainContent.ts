/**
 * The shipped terrain tools as the kernel and `tech-tree` take them: one `vehicle-item` per tool
 * (slot acceptance and one attach point, #162 acceptance 1), one `tech.terrain.*` node each plus
 * the fourth cradle's (ticket 251), and their item cards (#159, the K7 `itemDescriptionEntries`
 * seam): the #162 flavour line, one line per `statPreview` line read at the Mark the card's level
 * names, and the price last. A card at level 0 reads Mark 1, the item as bought; its next value is
 * the next Mark until it is Mastered.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { div, fromSafeInteger, type Money } from '../../../systems/money'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import type { VehicleItem } from '../../../systems/registries/vehicleLoadout'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt, type TechNode } from '../../tech-tree'
import { SHIPPED_TERRAIN_ITEMS } from './shippedTools'
import { FOURTH_CRADLE_NODE } from './terrainCradle'
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

export const TERRAIN_VEHICLE_ITEMS: readonly VehicleItem[] =
  SHIPPED_TERRAIN_ITEMS.map(vehicleItemOf)

/** The tools' nodes and the fourth cradle's (ticket 251). */
export const TERRAIN_TECH_NODES: readonly TechNode[] = [
  ...SHIPPED_TERRAIN_ITEMS.map(techNodeOf),
  FOURTH_CRADLE_NODE,
]

export const TERRAIN_ITEM_CARDS: readonly ItemDescriptionEntry[] = SHIPPED_TERRAIN_ITEMS.map(cardOf)

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
export function markOfLevel(level: number): number {
  return Math.max(FIRST_MARK, level)
}

function cardOf(item: TerrainItem): ItemDescriptionEntry {
  const lines = statPreview(item.itemId, FIRST_MARK, LABEL_PLANET)?.lines ?? []
  return {
    id: `terrain-tools.${item.itemId.slice(item.itemId.indexOf('.') + 1)}`,
    matches: { kind: 'vehicle-item', id: item.itemId },
    flavour: item.description,
    statLines: [...lines.map(markLineSpecOf), priceLineSpecOf(item)],
  }
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
