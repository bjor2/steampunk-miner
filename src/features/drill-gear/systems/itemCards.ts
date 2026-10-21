/**
 * The drill-gear items' card entries (#159, the K7 `itemDescriptionEntries` seam): the #162
 * flavour line, one stat line per `cardLinesOf` line read at the Mark the card's level names, and
 * the next Mark milestone's verb (#256).
 * A card at level 0 (the slot card, an item not yet marked up) reads Mark 1, the item as bought; a
 * line the Marks step shows the next Mark until the item is Mastered. The other lines and the
 * price never change with the Mark.
 */
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt, milestoneLineSpecsOf } from '../../tech-tree'
import { reachBoomNotesOf } from './aheadCutNotes'
import { noteLineSpecOf, SIDEGRADE_NOTE, widthLineSpecsOf } from './boreWidthCopy'
import { cardLinesOf, type CardLine } from './cardLines'
import { REACH_BOOM_ID, SIDE_CUTTERS_ID } from './cuttersAndBoom'
import { DRILL_GEAR_FORK, PLUNGE_CROWN_ID } from './drillGearFork'
import {
  drillGearItemOf,
  gearValueOf,
  markLadderOf,
  SHIPPED_DRILL_GEAR,
  type DrillGearItem,
} from './drillGearItems'
import { cardOfMark, SIDE_CUTTER_MARKS } from './sideCutterMarks'
import { TWIN_BIT_ID } from './twinBit'

const FIRST_MARK = 1

/** Each item's "Note" lines, read when the cards below are built. */
const NOTES_BY_ITEM: Readonly<Record<string, () => string[]>> = {
  [REACH_BOOM_ID]: () => [...reachBoomNotesOf(DRILL_GEAR_FORK, PLUNGE_CROWN_ID), SIDEGRADE_NOTE],
  [TWIN_BIT_ID]: () => [SIDEGRADE_NOTE],
}

export const DRILL_GEAR_ITEM_CARDS: readonly ItemDescriptionEntry[] = [
  ...SHIPPED_DRILL_GEAR.map(cardOf),
  ...SIDE_CUTTER_MARKS.map(cardOfMark),
]

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
export function markOfLevel(level: number): number {
  return Math.max(FIRST_MARK, level)
}

function cardOf(item: DrillGearItem): ItemDescriptionEntry {
  return {
    id: `drill-gear.${item.itemId.slice('gear.'.length)}`,
    matches: { kind: 'vehicle-item', id: item.itemId },
    flavour: item.description,
    statLines: [
      ...cardLinesOf(item.itemId, FIRST_MARK).map(lineSpecOf),
      ...widthLinesOf(item),
      ...notesOf(item).map(noteLineSpecOf),
      ...milestoneLineSpecsOf(markLadderOf(item)),
    ],
  }
}

/** The side cutters' bore width and ore gain at their own side cells (ticket 621); none for others. */
function widthLinesOf(item: DrillGearItem): DescribedStatLineSpec[] {
  return item.itemId === SIDE_CUTTERS_ID
    ? widthLineSpecsOf(gearValueOf(SIDE_CUTTERS_ID, 'sideCells'))
    : []
}

/**
 * The card's "Note" lines (Content on #392): the boom's doesn't-stack line, and the drill types'
 * sidegrade line (VS on #308, ticket 621); none for most items.
 */
function notesOf(item: DrillGearItem): string[] {
  return NOTES_BY_ITEM[item.itemId]?.() ?? []
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
