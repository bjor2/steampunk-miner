/**
 * How a planet's material kinds look in the ground (docs/standards/feature-slices.md 3.72, ticket
 * 450 under #139): the `roster` slice provides it; with no provider no tile carries a kind slot,
 * the look table stays empty and the terrain draws as it did before materials. Render-only: the
 * looks are a pure read of the planet, so a chunk is rebuilt only when its cells change, and what
 * the player has seen is asked only when the table is rewritten, never per tile or per frame.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { KindLook, RarityLook } from '../render/kindLookTable'
import type { PlanetParams } from '../world/planetParams'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface KindLookProvider {
  id: string
  /** By roster index (slot 1 first), null where a slot binds no species; empty with no roster. */
  kindLooksOf(params: PlanetParams): readonly (KindLook | null)[]
  /** Rarity leads 1 to 4 (uncommon to mythic), each drawing at least the tint, frame and glow below it. */
  rarityLooks(): readonly RarityLook[]
  /**
   * Whether the player has met the species, so its look and rarity may show (Horizontal Scaler's
   * condition a on #450): an unseen kind draws the family look with no rarity tint or frame.
   */
  hasSeenKind(state: AuthorityState, playerId: string, speciesId: string): boolean
}

export const KIND_LOOK_REGISTRY = defineOneProviderRegistry<KindLookProvider>('kindLook')

/** The registered provider, or null: no tile carries a kind slot. */
export function kindLookProvider(): KindLookProvider | null {
  const [provider] = entriesOf(KIND_LOOK_REGISTRY)
  return provider ?? null
}
