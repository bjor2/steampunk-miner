/**
 * The resonance whistle's card entry (#159, the K7 `itemDescriptionEntries` seam): the #245 flavour
 * line and one stat line per `statPreview` line, read at the Mark the card's level names. A card at
 * level 0 (the slot card, an item not yet marked up) reads Mark 1, the item as bought; a stat the
 * Marks step shows the next Mark's value until the whistle is Mastered. The reach, the energy a
 * blow costs and the price never change with the Mark.
 */
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt } from '../../tech-tree'
import { statPreview, type StatPreviewLine } from './statPreview'
import { WHISTLE_DESCRIPTION, WHISTLE_ID, whistleMarkLadder } from './whistleItem'

const FIRST_MARK = 1
/** Any planet: the labels do not change with it. */
const LABEL_PLANET = 1

export const WHISTLE_ITEM_CARD: ItemDescriptionEntry = {
  id: 'aetheric.resonance_whistle',
  matches: { kind: 'vehicle-item', id: WHISTLE_ID },
  flavour: WHISTLE_DESCRIPTION,
  statLines: statPreview(WHISTLE_ID, FIRST_MARK, LABEL_PLANET).map(lineSpecOf),
}

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
export function markOfLevel(level: number): number {
  return Math.max(FIRST_MARK, level)
}

function lineSpecOf(line: StatPreviewLine, index: number): DescribedStatLineSpec {
  return {
    label: line.label,
    kind: line.isMarked ? 'linearInt' : 'geometric',
    value: (ref: ItemRef, ctx: ItemCtx) =>
      statPreview(ref.id, markOfLevel(ctx.level), ctx.planetIndex)[index].value,
    nextLevel: line.isMarked ? nextMarkOf : hasNoNextLevel,
  }
}

function nextMarkOf(_ref: ItemRef, ctx: ItemCtx): number | null {
  const mark = markOfLevel(ctx.level)
  return isMasteredAt(whistleMarkLadder(), mark) ? null : mark + 1
}
