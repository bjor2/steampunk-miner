/**
 * How a planet's material kinds look in the ground (docs/standards/feature-slices.md 3.72, ticket
 * 450 under #139): the `roster` slice provides it; with no provider no tile carries a kind slot,
 * the look table stays empty and the terrain draws as it did before materials. Render-only: the
 * looks are a pure read of the planet, so a chunk is rebuilt only when its cells change, and what
 * the player has seen is asked only when the table is rewritten, never per tile or per frame.
 * The provider also names each act's hero atlas (ticket 451): its asset and the species of each
 * cell; with none, every hero draws its procedural look.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { HeroAtlasCells } from '../render/heroAtlas'
import type { KindLook, RarityLook } from '../render/kindLookTable'
import type { PlanetParams } from '../world/planetParams'
import { defineOneProviderRegistry, entriesOf } from './seal'

export interface KindLookProvider {
  id: string
  /** By roster index (slot 1 first), null where a slot binds no species; empty with no roster. */
  kindLooksOf(params: PlanetParams): readonly (KindLook | null)[]
  /** Rarity leads 1 to 4 (uncommon to mythic), each drawing at least the tint, frame and glow below it. */
  rarityLooks(): readonly RarityLook[]
  /** The rarity tier a lead names (`common` at 0 to `mythic` at 4, ticket 454); null past them. */
  rarityIdOfLead(lead: number): string | null
  /**
   * Whether the player has met the species, so its rarity may show (Horizontal Scaler's condition a
   * on #450 as the GD split it on #698): an unseen kind draws its own skin with no rarity tint,
   * frame or glow.
   */
  hasSeenKind(state: AuthorityState, playerId: string, speciesId: string): boolean
  /**
   * The atlas of the act holding the planet, or null; the same object for every planet of one act,
   * so a planet change inside an act swaps nothing (TD shape 6226270701, "#451 shape" item 4).
   */
  heroAtlasOf(planetIndex: number): HeroAtlasCells | null
}

export const KIND_LOOK_REGISTRY = defineOneProviderRegistry<KindLookProvider>('kindLook')

/** The registered provider, or null: no tile carries a kind slot. */
export function kindLookProvider(): KindLookProvider | null {
  const [provider] = entriesOf(KIND_LOOK_REGISTRY)
  return provider ?? null
}
