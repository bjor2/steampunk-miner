/**
 * The sensing items' card entries (#159, the K7 `itemDescriptionEntries` seam): the #162 flavour
 * line, one stat line per `statPreview` line read at the Mark the card's level names, the next Mark
 * milestone's verb (#256), and the price last. A card at level 0 (an item not yet marked up) reads
 * Mark 1, the item as bought; a line a Mark steps shows the next Mark's value until the item is
 * Mastered, and a fixed line (the wind-up, the echo's radius, the mortar's range) and the price
 * show none. Times read in seconds. The fork's two items file their own cards (ticket 410,
 * `forkItemCards.ts`) beside these.
 */
import { TICKS_PER_SECOND } from '../../../constants/physics'
import { div, fromSafeInteger, type Money } from '../../../systems/money'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt, milestoneLineSpecsOf } from '../../tech-tree'
import { SENSING_FORK_ITEM_CARDS } from './forkItemCards'
import { sensingItemOf, type SensingItem } from './sensingCatalogue'
import { SHIPPED_SENSING_ITEMS } from './sensingContent'
import { itemPriceOf, markLadderOf } from './sensingItems'
import { statPreview, type SensingStatLine, type SensingStatUnit } from './statPreview'

const FIRST_MARK = 1
/** Any planet: the lines do not change with it. */
const LABEL_PLANET = 1

const UNIT_SUFFIX: Readonly<Record<SensingStatUnit, string>> = {
  charges: '',
  crates: '',
  ticks: ' (s)',
  tiles: ' (tiles)',
  cells: ' (cells)',
}

export const SENSING_ITEM_CARDS: readonly ItemDescriptionEntry[] = [
  ...SHIPPED_SENSING_ITEMS.map(cardOf),
  ...SENSING_FORK_ITEM_CARDS,
]

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
function markOfLevel(level: number): number {
  return Math.max(FIRST_MARK, level)
}

function cardOf(item: SensingItem): ItemDescriptionEntry {
  const lines = statPreview(item.itemId, FIRST_MARK, LABEL_PLANET)?.lines ?? []
  return {
    id: cardIdOf(item),
    matches: { kind: 'vehicle-item', id: item.itemId },
    flavour: item.description,
    statLines: [
      ...lines.map(statLineSpecOf),
      ...milestoneLineSpecsOf(markLadderOf(item)),
      priceLineSpecOf(item),
    ],
  }
}

/** `tech.sensing.echo_sounder` files `sensing.echo_sounder`. */
function cardIdOf(item: SensingItem): string {
  return `sensing.${item.node.id.slice(item.node.id.lastIndexOf('.') + 1)}`
}

function statLineSpecOf(line: SensingStatLine, index: number): DescribedStatLineSpec {
  return {
    label: `${line.label}${UNIT_SUFFIX[line.unit]}`,
    kind: 'linearInt',
    value: previewValueAt(index),
    nextLevel: line.isMarkStepped ? nextMarkOf : hasNoNextLevel,
  }
}

function priceLineSpecOf(item: SensingItem): DescribedStatLineSpec {
  const label = item.powerUpClass === 'consumable' ? 'Price per unit' : 'Price'
  return { label, kind: 'geometric', value: priceOf, nextLevel: hasNoNextLevel }
}

function previewValueAt(index: number) {
  return (ref: ItemRef, ctx: ItemCtx): Money => {
    const line = statPreview(ref.id, markOfLevel(ctx.level), ctx.planetIndex)?.lines[index]
    return line === undefined ? fromSafeInteger(0) : valueInShownUnit(line)
  }
}

function priceOf(ref: ItemRef, ctx: ItemCtx): Money {
  const item = sensingItemOf(ref.id)
  return item === null ? fromSafeInteger(0) : itemPriceOf(item, ctx.planetIndex)
}

function nextMarkOf(ref: ItemRef, ctx: ItemCtx): number | null {
  const item = sensingItemOf(ref.id)
  const mark = markOfLevel(ctx.level)
  if (item === null || isMasteredAt(markLadderOf(item), mark)) return null
  return mark + 1
}

function valueInShownUnit(line: SensingStatLine): Money {
  const value = fromSafeInteger(line.value)
  return line.unit === 'ticks' ? div(value, fromSafeInteger(TICKS_PER_SECOND)) : value
}
