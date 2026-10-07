/**
 * The mobility items' card entries (#159, the K7 `itemDescriptionEntries` seam): the #162 flavour
 * line and one stat line per `statPreview` line, read at the Mark the card's level names. A card
 * at level 0 (the slot card, an item not yet marked up) reads Mark 1, the item as bought; its next
 * value is the next Mark until the item is Mastered. The price never changes with the Mark.
 */
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt } from '../../tech-tree'
import { MOBILITY_ITEM_ROWS, type MobilityRow } from './mobilityCatalogue'
import { markLadderOf } from './markLadders'
import { statPreview } from './statPreview'

const FIRST_MARK = 1
/** Any planet: the labels do not change with it. */
const LABEL_PLANET = 1

export const MOBILITY_ITEM_CARDS: readonly ItemDescriptionEntry[] = MOBILITY_ITEM_ROWS.map(cardOf)

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
export function markOfLevel(level: number): number {
  return Math.max(FIRST_MARK, level)
}

function cardOf(row: MobilityRow): ItemDescriptionEntry {
  const labels = statPreview(row.itemId, FIRST_MARK, LABEL_PLANET).map((line) => line.label)
  const priceIndex = labels.length - 1
  return {
    id: `mobility.${row.node}`,
    matches: { kind: 'vehicle-item', id: row.itemId },
    flavour: row.flavour,
    statLines: [
      ...labels.slice(0, priceIndex).map(markLineSpecOf),
      priceLineSpecOf(labels[priceIndex], priceIndex),
    ],
  }
}

/** A stat the Marks step: its next value is the next Mark's. */
function markLineSpecOf(label: string, index: number): DescribedStatLineSpec {
  return { label, kind: 'linearInt', value: previewValueAt(index), nextLevel: nextMarkOf }
}

function priceLineSpecOf(label: string, index: number): DescribedStatLineSpec {
  return { label, kind: 'geometric', value: previewValueAt(index), nextLevel: hasNoNextLevel }
}

function previewValueAt(index: number) {
  return (ref: ItemRef, ctx: ItemCtx) =>
    statPreview(ref.id, markOfLevel(ctx.level), ctx.planetIndex)[index].value
}

function nextMarkOf(ref: ItemRef, ctx: ItemCtx): number | null {
  const ladder = markLadderOf(ref.id)
  const mark = markOfLevel(ctx.level)
  if (ladder === null || isMasteredAt(ladder, mark)) return null
  return mark + 1
}
