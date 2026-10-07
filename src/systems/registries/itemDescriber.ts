/**
 * What an item card says about a buyable (K7 #199; the #164 seam of the Technical Director with
 * the Horizontal and Vertical Scalers' amendments): one provider, the `descriptions` slice, turns
 * an item ref into a flavour line, formatted stat lines, an unlock line and a gate note. It carries
 * data, never a component: the kernel's one `ItemCard` draws it on the shop row, the platform card
 * and the tooltip, and with no provider registered the card draws today's row.
 *
 * Presentation only: a describer reads the read-only snapshot view, never authority state, and
 * changes no snapshot, digest, protocol or version. Answers are memoised per ref, level and planet
 * on one snapshot view, and only the rows a screen draws ask.
 */
import type { TrackKind } from '../economy/trackKind'
import type { ContentKind } from './content'
import type { ItemSnapshotView } from './itemSnapshotView'
import { defineOneProviderRegistry, entriesOf } from './seal'

/**
 * The kernel's item kinds. A slice adds a kind with no registered entries (a Mark, a generated
 * combo) by module augmentation, the way `ContentKinds` takes kinds:
 *
 *   declare module '<path to>/systems/registries/itemDescriber' {
 *     interface ItemKinds { 'tech-mark': true }
 *   }
 */
export interface ItemKinds {
  track: true
  service: true
  module: true
  bay: true
  artefact: true
}

export type ItemKind = keyof ItemKinds | ContentKind

export interface ItemRef {
  kind: ItemKind
  id: string
  /** Computed items: Mark N, a milestone grade, a dynamite size, a generated combo's planet. */
  grade?: number
}

export type ItemSourceKind = 'shop' | 'merchant' | 'drop' | 'reward'

/** Where the item is offered: merchant stock, an enemy drop and a quest reward keep their kinds. */
export interface ItemSource {
  kind: ItemSourceKind
  id?: string
}

export interface ItemCtx {
  playerId: string
  planetIndex: number
  /** The level, grade or count the player owns now; the card's next line is one step on. */
  level: number
  source?: ItemSource
  view: ItemSnapshotView
}

/** One "what it does" line, every value already formatted by `formatAmount`/`formatPercent`. */
export interface StatLine {
  label: string
  kind: TrackKind
  now: string
  next?: string
  /** next − now, computed in Money before formatting. */
  delta?: string
  /** (next − now) / now, computed in Money before formatting. */
  deltaPct?: string
  /** Two-tier tracks (#181): the steps to the next major and its value. */
  major?: { levelsTo: number; value: string }
  /** Saturating tracks only: the cap and the share of it still to gain. */
  cap?: { value: string; headroomPct: string }
}

export interface ItemDescription {
  /** One plain-text sentence, no markup. */
  flavour: string
  statLines: readonly StatLine[]
  gateNote?: string
  /** The "Unlocked by / Requires" line, shown while the item is locked or not yet owned. */
  unlock?: string
}

export interface ItemDescriberProvider {
  id: string
  describe(ref: ItemRef, ctx: ItemCtx): ItemDescription | null
}

export const ITEM_DESCRIBER_REGISTRY =
  defineOneProviderRegistry<ItemDescriberProvider>('itemDescriber')

interface RememberedDescription {
  provider: ItemDescriberProvider
  description: ItemDescription | null
}

const rememberedOfView = new WeakMap<ItemSnapshotView, Map<string, RememberedDescription>>()

/** The provider's description of the item; null with no provider, so the card draws today's row. */
export function describeItem(ref: ItemRef, ctx: ItemCtx): ItemDescription | null {
  const [provider] = entriesOf(ITEM_DESCRIBER_REGISTRY)
  if (provider === undefined) return null
  return rememberedDescriptionOf(provider, ref, ctx)
}

function rememberedDescriptionOf(
  provider: ItemDescriberProvider,
  ref: ItemRef,
  ctx: ItemCtx,
): ItemDescription | null {
  const remembered = rememberedOf(ctx.view)
  const key = memoKeyOf(ref, ctx)
  const known = remembered.get(key)
  if (known?.provider === provider) return known.description
  const description = provider.describe(ref, ctx)
  remembered.set(key, { provider, description })
  return description
}

function rememberedOf(view: ItemSnapshotView): Map<string, RememberedDescription> {
  const known = rememberedOfView.get(view)
  if (known !== undefined) return known
  const remembered = new Map<string, RememberedDescription>()
  rememberedOfView.set(view, remembered)
  return remembered
}

function memoKeyOf(ref: ItemRef, ctx: ItemCtx): string {
  const source = ctx.source === undefined ? '' : `${ctx.source.kind}:${ctx.source.id ?? ''}`
  return [ref.kind, ref.id, ref.grade ?? '', ctx.level, ctx.planetIndex, source].join('|')
}
