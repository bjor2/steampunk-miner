/**
 * The drill-gear items' card entries (#159, the K7 `itemDescriptionEntries` seam): the #162
 * flavour line and one stat line per `cardLinesOf` line, read at the Mark the card's level names.
 * A card at level 0 (the slot card, an item not yet marked up) reads Mark 1, the item as bought; a
 * line the Marks step shows the next Mark until the item is Mastered. The other lines and the
 * price never change with the Mark.
 */
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt } from '../../tech-tree'
import { cardLinesOf, type CardLine } from './cardLines'
import {
  drillGearItemOf,
  markLadderOf,
  SHIPPED_DRILL_GEAR,
  type DrillGearItem,
} from './drillGearItems'

const FIRST_MARK = 1

export const DRILL_GEAR_ITEM_CARDS: readonly ItemDescriptionEntry[] = SHIPPED_DRILL_GEAR.map(cardOf)

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
export function markOfLevel(level: number): number {
  return Math.max(FIRST_MARK, level)
}

function cardOf(item: DrillGearItem): ItemDescriptionEntry {
  return {
    id: `drill-gear.${item.itemId.slice('gear.'.length)}`,
    matches: { kind: 'vehicle-item', id: item.itemId },
    flavour: item.description,
    statLines: cardLinesOf(item.itemId, FIRST_MARK).map(lineSpecOf),
  }
}

function lineSpecOf(line: CardLine, index: number): DescribedStatLineSpec {
  const nextLevel = line.isMarkStepped ? nextMarkOf : hasNoNextLevel
  return { label: line.label, kind: line.kind, value: valueAt(index), nextLevel }
}

function valueAt(index: number) {
  return (ref: ItemRef, ctx: ItemCtx) => cardLinesOf(ref.id, markOfLevel(ctx.level))[index].value
}

function nextMarkOf(ref: ItemRef, ctx: ItemCtx): number | null {
  const mark = markOfLevel(ctx.level)
  const item = drillGearItemOf(ref.id)
  if (item === null || isMasteredAt(markLadderOf(item), mark)) return null
  return mark + 1
}
