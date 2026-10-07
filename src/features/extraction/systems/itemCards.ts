/**
 * The drain's card entry (#159, the K7 `itemDescriptionEntries` seam): the #162 flavour line, one
 * stat line per `statPreview` line read at the Mark the card's level names, the one-off price,
 * and the trip cap line (#164 Systems): the share of this trip's cap the income items have used,
 * read from the `extraction` section in the card's snapshot view, the same number on every income
 * item's card. A card at level 0 (the slot card, an item not yet marked up) reads Mark 1.
 */
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import type { ItemDescriptionEntry } from '../../../systems/registries/itemDescriptionEntries'
import { hasNoNextLevel, type DescribedStatLineSpec } from '../../descriptions'
import { isMasteredAt } from '../../tech-tree'
import { extractionItemOf, itemPriceOf, markLadderOf, type ExtractionItem } from './extractionItems'
import { EXTRACTION_TRIP_SECTION } from './incomeTrip'
import { toolOf } from './mineralDrain'
import { statPreview, type ExtractionStatName } from './statPreview'
import { tripCapUsedPercentOf } from './tripCap'

const FIRST_MARK = 1
/** Any planet: the item is the same on every one. */
const LABEL_PLANET = 1
const WHOLE_TRIP_CAP = 100

/** The stats a Mark steps; the act and the reach stay as bought. */
const MARKED_STATS: readonly ExtractionStatName[] = ['charges', 'cooldown', 'cells']

export function itemCardOf(item: ExtractionItem): ItemDescriptionEntry {
  const preview = statPreview(item.itemId, FIRST_MARK, LABEL_PLANET)
  return {
    id: toolOf(item),
    matches: { kind: 'vehicle-item', id: item.itemId },
    flavour: item.description,
    statLines: [
      ...(preview?.lines ?? []).map((line, index) => statLineSpecOf(line.stat, line.label, index)),
      priceLineSpec(),
      tripCapLineSpec(),
    ],
  }
}

/** The Mark a card's level names: Mark 1 before any Mark is researched. */
export function markOfLevel(level: number): number {
  return Math.max(FIRST_MARK, level)
}

function statLineSpecOf(
  stat: ExtractionStatName,
  label: string,
  index: number,
): DescribedStatLineSpec {
  const isMarked = MARKED_STATS.includes(stat)
  return {
    label,
    kind: 'linearInt',
    value: (ref, ctx) =>
      statPreview(ref.id, markOfLevel(ctx.level), ctx.planetIndex)?.lines[index].value ?? 0,
    nextLevel: isMarked ? nextMarkOf : hasNoNextLevel,
  }
}

function priceLineSpec(): DescribedStatLineSpec {
  return {
    label: 'Price',
    kind: 'geometric',
    value: (ref) => itemPriceOf(extractionItemOf(ref.id) as ExtractionItem),
    nextLevel: hasNoNextLevel,
  }
}

function tripCapLineSpec(): DescribedStatLineSpec {
  return {
    label: 'Trip cap used (%)',
    kind: 'saturating',
    value: (_ref, ctx) => tripCapUsedPercentOf(ctx.view.section(EXTRACTION_TRIP_SECTION)),
    cap: () => WHOLE_TRIP_CAP,
    nextLevel: hasNoNextLevel,
  }
}

function nextMarkOf(ref: ItemRef, ctx: ItemCtx): number | null {
  const item = extractionItemOf(ref.id)
  const mark = markOfLevel(ctx.level)
  if (item === null || isMasteredAt(markLadderOf(item), mark)) return null
  return mark + 1
}
