/**
 * The twists' item cards (K7 #199, through the `descriptions` slice's one voice): each card's
 * flavour line, then its base item's own amount lines read at the Mark the player plays that item
 * at, labelled with the item's name. A twist has no Marks and plays at its base item's current
 * values (#162 4.6), so its card shows those values as the base item's card does, with no maths on
 * them (the combos' card rule, GD lock on #206, decision 8). The base item's entry is read when a
 * card is drawn, after every slice registered, never at import.
 */
import { contentOf } from '../../../systems/registries/content'
import type { ItemCtx, ItemRef } from '../../../systems/registries/itemDescriber'
import {
  itemDescriptionEntryOf,
  type ItemDescriptionEntry,
} from '../../../systems/registries/itemDescriptionEntries'
import { artefactItemOf } from '../../../systems/registries/kernelItems'
import { hasNoNextLevel, isAmountLine, type DescribedStatLineSpec } from '../../descriptions'
import { researchedMarkInViewOf } from '../../tech-tree'
import { TWISTS, type Twist } from './twistCatalogue'

export const TWIST_CARDS: readonly ItemDescriptionEntry[] = TWISTS.map(twistCardOf)

function twistCardOf(twist: Twist): ItemDescriptionEntry {
  const { kind, id } = artefactItemOf(twist.optionId)
  return {
    id: `${twist.hookId}_card`,
    matches: { kind, id },
    flavour: twist.description,
    get statLines() {
      return baseAmountSpecsOf(twist.baseItemId).map((spec) => baseLineSpecOf(spec, twist))
    },
  }
}

/** The base item card's amount lines, as its lane filed them; none for an item with no card. */
function baseAmountSpecsOf(baseItemId: string): DescribedStatLineSpec[] {
  const entry = itemDescriptionEntryOf(baseRefOf(baseItemId))
  const specs = (entry?.statLines ?? []) as readonly DescribedStatLineSpec[]
  return specs.filter(isAmountLine)
}

/** The base item's line at its researched Mark: the value its own card shows now. */
function baseLineSpecOf(spec: DescribedStatLineSpec, twist: Twist): DescribedStatLineSpec {
  const baseRef = baseRefOf(twist.baseItemId)
  const baseCtxOf = (ctx: ItemCtx): ItemCtx => ({
    ...ctx,
    level: researchedMarkInViewOf(ctx.view, twist.baseItemId),
  })
  const cap = spec.cap
  return {
    label: `${baseItemNameOf(twist.baseItemId)}: ${spec.label}`,
    kind: spec.kind,
    value: (_ref, ctx) => spec.value(baseRef, baseCtxOf(ctx)),
    nextLevel: hasNoNextLevel,
    ...(cap !== undefined && {
      cap: (_ref: ItemRef, ctx: ItemCtx) => cap(baseRef, baseCtxOf(ctx)),
    }),
  }
}

function baseRefOf(baseItemId: string): ItemRef {
  return { kind: 'vehicle-item', id: baseItemId }
}

/** The base power-up's player-facing name; its id when no lane registered it. */
function baseItemNameOf(baseItemId: string): string {
  const powerUp = contentOf('power-up').find((entry) => entry.itemId === baseItemId)
  return powerUp?.name ?? baseItemId
}
