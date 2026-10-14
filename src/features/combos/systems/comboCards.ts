/**
 * A combo's item card (#159, the K7 `itemDescriptionEntries` seam; GD lock on #206, decision 8):
 * the #162 flavour line, "Grade N" (combos have no Mark ladder), each parent's own card lines read
 * at the Mark the player plays that parent at (`researchedMarkInViewOf` on the card's snapshot),
 * and the one-off price the Upgrade bay debits.
 *
 * The parents' lines are their own entries' specs, read raw and formatted by the one describer, so
 * they show what the parent's card shows, with no maths on them; each is labelled with its parent's
 * name. A parent's word lines (its next milestone) look ahead from the parent's Mark, which a word
 * line cannot be handed, so they stay on the parent's card. The parents' entries are read when a
 * card is drawn, after every slice registered, never at import.
 */
import { contentOf } from '../../../systems/registries/content'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import {
  itemDescriptionEntryOf,
  type ItemDescriptionEntry,
} from '../../../systems/registries/itemDescriptionEntries'
import { ZERO_MONEY } from '../../../systems/money'
import { hasNoNextLevel, isAmountLine, type DescribedStatLineSpec } from '../../descriptions'
import { researchedMarkInViewOf } from '../../tech-tree'
import type { ComboItem } from './comboCatalogue'
import { comboPriceOf } from './comboSales'

const GRADE_LINE_LABEL = 'Combo'
/** The shop draws an unowned item at level 0: the grade it sells is grade 1. */
const FIRST_GRADE = 1

export function comboCardOf(item: ComboItem): ItemDescriptionEntry {
  return {
    id: `combos.${item.itemId.slice(item.itemId.indexOf('.') + 1)}`,
    matches: { kind: 'vehicle-item', id: item.itemId },
    flavour: item.description,
    get statLines() {
      return [gradeLineSpec(), ...parentLineSpecsOf(item), priceLineSpec()]
    },
  }
}

/** The grade a card's level names: grade 1 before the combo is owned. */
export function gradeOfLevel(level: number): number {
  return Math.max(FIRST_GRADE, level)
}

function gradeLineSpec(): DescribedStatLineSpec {
  return {
    label: GRADE_LINE_LABEL,
    kind: 'linearInt',
    value: (_ref, ctx) => gradeOfLevel(ctx.level),
    nextLevel: hasNoNextLevel,
    textOf: (level) => `Grade ${gradeOfLevel(level)}`,
  }
}

function parentLineSpecsOf(item: ComboItem): DescribedStatLineSpec[] {
  return item.parentItemIds.flatMap((parentItemId, index) =>
    parentAmountSpecsOf(parentItemId).map((spec) =>
      parentLineSpecOf(spec, parentItemId, nodeNameOf(item.parents[index])),
    ),
  )
}

/** The parent card's amount lines, as its lane filed them; none for a parent with no card. */
function parentAmountSpecsOf(parentItemId: string): DescribedStatLineSpec[] {
  const entry = itemDescriptionEntryOf(parentRefOf(parentItemId))
  const specs = (entry?.statLines ?? []) as readonly DescribedStatLineSpec[]
  return specs.filter(isAmountLine)
}

/** The parent's line, read at the parent's Mark: the same value its own card shows now. */
function parentLineSpecOf(
  spec: DescribedStatLineSpec,
  parentItemId: string,
  parentName: string,
): DescribedStatLineSpec {
  const parentRef = parentRefOf(parentItemId)
  const parentCtxOf = (ctx: ItemCtx): ItemCtx => ({
    ...ctx,
    level: researchedMarkInViewOf(ctx.view, parentItemId),
  })
  const cap = spec.cap
  return {
    label: `${parentName}: ${spec.label}`,
    kind: spec.kind,
    value: (_ref, ctx) => spec.value(parentRef, parentCtxOf(ctx)),
    nextLevel: hasNoNextLevel,
    ...(cap !== undefined && {
      cap: (_ref: ItemRef, ctx: ItemCtx) => cap(parentRef, parentCtxOf(ctx)),
    }),
  }
}

function priceLineSpec(): DescribedStatLineSpec {
  return {
    label: 'Price',
    kind: 'geometric',
    value: (ref) => comboPriceOf(ref.id) ?? ZERO_MONEY,
    nextLevel: hasNoNextLevel,
  }
}

function parentRefOf(parentItemId: string): ItemRef {
  return { kind: 'vehicle-item', id: parentItemId }
}

/** The parent node's player-facing name; its id when no lane registered it. */
function nodeNameOf(nodeId: string): string {
  const node = contentOf('tech-node').find((entry) => entry.id === nodeId)
  return node?.name ?? nodeId
}
