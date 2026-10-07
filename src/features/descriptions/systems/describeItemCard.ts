/**
 * The one item describer (#164, the `itemDescriber` provider of K7 #199): it finds the ref's entry
 * in `itemDescriptionEntries` (this slice's side table for the kernel buyables, and whatever other
 * slices file for their own items) and turns it into the card's flavour and formatted stat lines,
 * so every item speaks in one voice. A ref with no entry answers null, the card draws today's row,
 * and the coverage spec fails.
 *
 * `From: <source>` is the unlock line of an item offered somewhere other than the Guild's shops
 * (Progression's content call on #164).
 */
import type {
  ItemCtx,
  ItemDescriberProvider,
  ItemDescription,
  ItemRef,
} from '../../../systems/registries/itemDescriber'
import {
  itemDescriptionEntryOf,
  type ItemDescriptionEntry,
} from '../../../systems/registries/itemDescriptionEntries'
import { statLineOf } from './statLineOf'

export const ITEM_CARD_DESCRIBER: ItemDescriberProvider = {
  id: 'descriptions.item-cards',
  describe: describeItemCard,
}

export function describeItemCard(ref: ItemRef, ctx: ItemCtx): ItemDescription | null {
  const entry = itemDescriptionEntryOf(ref)
  if (entry === null) return null
  return {
    flavour: flavourOf(entry, ref),
    statLines: entry.statLines.map((spec) => statLineOf(spec, ref, ctx)),
    ...sourceLineOf(ctx),
  }
}

export function flavourOf(entry: ItemDescriptionEntry, ref: ItemRef): string {
  return typeof entry.flavour === 'string' ? entry.flavour : entry.flavour(ref)
}

function sourceLineOf(ctx: ItemCtx): Pick<ItemDescription, 'unlock'> {
  const source = ctx.source
  if (source === undefined || source.kind === 'shop') return {}
  return { unlock: `From: ${source.kind}` }
}
