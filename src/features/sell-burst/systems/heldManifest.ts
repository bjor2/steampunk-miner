/**
 * What the receipt knows of the hold (ticket 717): the cargo keeps units by tier alone, so the
 * kinds a tier holds (a species, else an ore type) are tallied as the units come in, by the same
 * look-only reading the pickup popup names them by (ticket 695). The tally never says more than
 * the hold holds: after each batch it is cut back to the authority's count per tier, the latest
 * units first, so a refinery batch, a lost hold or a restored save leaves no ghost behind. A sold
 * tier always goes whole (`withoutOre`), so a sale takes every kind of it, and what the tally
 * missed sells as the tier's own unnamed kind. Look only: no price, sale or save reads it.
 */
import type { SoldItem } from '../../../systems/authority/domainEvent'
import type { SeenRarity } from '../../../systems/render/seenRarity'

/** One unit into the hold as the receipt names it. */
export interface HeldUnit {
  /** The cargo tier the unit is held (and sold) at. */
  tier: number
  /** `species:<id>`, `ore:<ore id>`, or `tier:<tier>` for a unit nothing named. */
  key: string
  /** The species' or ore type's name; null for the tier's own unnamed kind. */
  name: string | null
  /** The species' rarity once the player has seen it; null while unspecified. */
  rarity: SeenRarity | null
}

export interface HeldKind extends HeldUnit {
  count: number
}

/** The hold's kinds in the order they first came in. */
export type HeldManifest = readonly HeldKind[]

export const EMPTY_MANIFEST: HeldManifest = []

export function manifestWithUnit(manifest: HeldManifest, unit: HeldUnit): HeldManifest {
  const at = manifest.findIndex((kind) => isSameKind(kind, unit))
  if (at < 0) return [...manifest, { ...unit, count: 1 }]
  return manifest.map((kind, index) => (index === at ? withOneMore(kind, unit) : kind))
}

/** The tally cut back to what the hold holds of each tier: the latest kinds of a tier go first. */
export function manifestWithinHold(
  manifest: HeldManifest,
  ore: Readonly<Record<string, number>>,
): HeldManifest {
  const room = new Map<number, number>()
  const kept: HeldKind[] = []
  for (const kind of manifest) {
    const left = room.get(kind.tier) ?? ore[String(kind.tier)] ?? 0
    const count = Math.min(kind.count, left)
    room.set(kind.tier, left - count)
    if (count > 0) kept.push(count === kind.count ? kind : { ...kind, count })
  }
  return kept
}

/** The kinds a sale took, its unnamed remainder per tier included, and the tally it left. */
export function takeSoldKinds(
  manifest: HeldManifest,
  items: readonly SoldItem[],
): { sold: HeldKind[]; manifest: HeldManifest } {
  return {
    sold: items.flatMap((item) => soldKindsOfItem(manifest, item)),
    manifest: manifest.filter((kind) => !isSoldTier(items, kind.tier)),
  }
}

function soldKindsOfItem(manifest: HeldManifest, item: SoldItem): HeldKind[] {
  const named = manifestWithinHold(
    manifest.filter((kind) => kind.tier === item.tier),
    { [String(item.tier)]: item.amount },
  )
  const missed = item.amount - named.reduce((total, kind) => total + kind.count, 0)
  return missed > 0 ? [...named, unnamedKindOf(item.tier, missed)] : [...named]
}

function unnamedKindOf(tier: number, count: number): HeldKind {
  return { tier, key: `tier:${tier}`, name: null, rarity: null, count }
}

function isSoldTier(items: readonly SoldItem[], tier: number): boolean {
  return items.some((item) => item.tier === tier)
}

function isSameKind(kind: HeldKind, unit: HeldUnit): boolean {
  return kind.tier === unit.tier && kind.key === unit.key
}

/** A rarity seen on a later unit of the kind names the whole kind. */
function withOneMore(kind: HeldKind, unit: HeldUnit): HeldKind {
  return { ...kind, count: kind.count + 1, rarity: kind.rarity ?? unit.rarity }
}
