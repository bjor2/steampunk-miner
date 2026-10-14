/**
 * The aetheric items' card entries (#159, the K7 `itemDescriptionEntries` seam): the #245 flavour
 * line and one stat line per `statPreview` line, read at the Mark the card's level names. A card at
 * level 0 (the slot card, an item not yet marked up) reads Mark 1, the item as bought; a stat the
 * Marks step shows the next Mark's value until the item is Mastered. The rest never changes with
 * the Mark.
 */
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt, type MarkLadder } from '../../tech-tree'
import { ARC_COIL_DESCRIPTION, ARC_COIL_ID, arcCoilMarkLadder } from './arcCoilItem'
import { CONDENSER_DESCRIPTION, CONDENSER_ID, condenserMarkLadder } from './condenserItem'
import { GOVERNOR_DESCRIPTION, GOVERNOR_ID, governorMarkLadder } from './governorItem'
import { LANTERN_DESCRIPTION, LANTERN_ID, lanternMarkLadder } from './lanternItem'
import { statPreview, type StatPreviewLine } from './statPreview'
import { WHISTLE_DESCRIPTION, WHISTLE_ID, whistleMarkLadder } from './whistleItem'

const FIRST_MARK = 1
/** Any planet: the labels do not change with it. */
const LABEL_PLANET = 1

export const WHISTLE_ITEM_CARD = itemCardOf(
  'aetheric.resonance_whistle',
  WHISTLE_ID,
  WHISTLE_DESCRIPTION,
  whistleMarkLadder(),
)

export const LANTERN_ITEM_CARD = itemCardOf(
  'aetheric.phase_lantern',
  LANTERN_ID,
  LANTERN_DESCRIPTION,
  lanternMarkLadder(),
)

export const ARC_COIL_ITEM_CARD = itemCardOf(
  'aetheric.arc_coil',
  ARC_COIL_ID,
  ARC_COIL_DESCRIPTION,
  arcCoilMarkLadder(),
)

export const GOVERNOR_ITEM_CARD = itemCardOf(
  'aetheric.chronometric_governor',
  GOVERNOR_ID,
  GOVERNOR_DESCRIPTION,
  governorMarkLadder(),
)

export const CONDENSER_ITEM_CARD = itemCardOf(
  'aetheric.aether_condenser',
  CONDENSER_ID,
  CONDENSER_DESCRIPTION,
  condenserMarkLadder(),
)

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
export function markOfLevel(level: number): number {
  return Math.max(FIRST_MARK, level)
}

function itemCardOf(
  id: string,
  itemId: string,
  flavour: string,
  ladder: MarkLadder,
): ItemDescriptionEntry {
  return {
    id,
    matches: { kind: 'vehicle-item', id: itemId },
    flavour,
    statLines: statPreview(itemId, FIRST_MARK, LABEL_PLANET).map((line, index) =>
      lineSpecOf(line, index, ladder),
    ),
  }
}

function lineSpecOf(
  line: StatPreviewLine,
  index: number,
  ladder: MarkLadder,
): DescribedStatLineSpec {
  return {
    label: line.label,
    kind: line.isMarked ? 'linearInt' : 'geometric',
    value: (ref: ItemRef, ctx: ItemCtx) =>
      statPreview(ref.id, markOfLevel(ctx.level), ctx.planetIndex)[index].value,
    nextLevel: line.isMarked ? (_ref, ctx) => nextMarkOf(ladder, ctx) : hasNoNextLevel,
  }
}

function nextMarkOf(ladder: MarkLadder, ctx: ItemCtx): number | null {
  const mark = markOfLevel(ctx.level)
  return isMasteredAt(ladder, mark) ? null : mark + 1
}
