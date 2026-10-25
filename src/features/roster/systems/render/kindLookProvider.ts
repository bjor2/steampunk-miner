/**
 * The roster's `kindLook` provider (feature-slices.md 3.72, ticket 450 under #139): each roster
 * slot of a planet shows its species' silhouette, pattern and hue slot colour from the materials
 * table, and its rarity as the tier offset its slot names. A species keeps one look on every
 * band and planet whose pool holds it, since the look reads the species row alone, never the
 * cell's tier (id to price stays single-valued). Look only: horizontal, no price, gate or income
 * reads it.
 *
 * Seen (Horizontal Scaler's condition a on #450, split by the GD on #698): a species draws its
 * skin from the first frame, and its rarity shows once the player has met it, asked through the
 * kernel's discovery query under the key `material:<species id>`, which the codex records the
 * first time the player touches a cell of it (ticket 546). The debug API can show every kind's
 * rarity for eye checks and the frame A/B.
 *
 * Heroes (ticket 451): the atlas of the planet's act, from the mineral skins slice with its pages
 * (ticket 852), one object per act, so the terrain swaps it only when a planet change crosses into
 * another act.
 *
 * Gems (ticket 786): a slot naming one of the planet's gems carries its rank k, cheapest first,
 * from the price table (`gemRankOfKind`), which the kernel's rank glint draws.
 *
 * Generated gems (ticket 889): a gem of a planet drawing its generated pool looks its cell up by
 * the cut the `gem-cuts` slice picked for it (`spriteId`), on the library's hue-tinted pages that
 * follow the act's own in the atlas handed out here, one object per act that holds a generated
 * planet; the planet's overlay comes from the same slice.
 */
import type { AuthorityState } from '../../../../systems/authority/authorityState'
import { hasDiscovered, type DiscoveryFallback } from '../../../../systems/registries/discovery'
import type { KindLookProvider } from '../../../../systems/registries/kindLook'
import type { GemOverlay } from '../../../../systems/render/gemOverlays'
import type { HeroAtlasCells } from '../../../../systems/render/heroAtlas'
import type { KindLook, RarityLook } from '../../../../systems/render/kindLookTable'
import {
  GENERATED_POOLS_FIRST_PLANET,
  type PlanetParams,
} from '../../../../systems/world/planetParams'
import { gemCutPagesOf } from '../../../gem-cuts'
import {
  FRAMED_RARITIES,
  hueSlotColourOf,
  MATERIALS,
  RARITY_LOOKS,
  type Material,
  type MaterialTable,
} from '../../../materials'
import { heroAtlasOfAct } from '../../../mineral-skins'
import { rarityTiers, type KindSlot } from '../../../ores'
import { actOf, type OreAct } from '../../../planet-mix'
import { generatedGemCutOf, generatedGemOverlayOf, isGeneratedPoolPlanet } from '../generatedRoster'
import { planetRosterOf } from '../planetRoster'
import { planetSpeciesOf } from '../planetSpecies'
import { gemRankOfKind } from '../rosterGems'

declare module '../../../../systems/registries/discovery' {
  interface DiscoveryKinds {
    material: 'ids'
  }
}

/** With no codex, nothing has been met. */
const NEVER_MET: DiscoveryFallback = {
  progress: {
    highestPlanetIndex: 0,
    collectedArtefactRowIds: new Set(),
    builtFacilityRowIds: new Set(),
    manualUnlockRowIds: new Set(),
  },
  unlockPlanetIndex: Number.POSITIVE_INFINITY,
}

export const ROSTER_KIND_LOOK: KindLookProvider = {
  id: 'roster.kind-look',
  kindLooksOf: planetKindLooksOf,
  rarityLooks: rarityLooksByLead,
  rarityIdOfLead,
  hasSeenKind: hasMetSpecies,
  heroAtlasOf: heroAtlasOfPlanet,
  gemOverlayOf: gemOverlayOfPlanet,
}

const atlasByAct = new Map<string, HeroAtlasCells | null>()

/**
 * The atlas of the act holding the planet: the act's own pages, then the gem-cut library's
 * hue-tinted pages where the act holds a generated planet (ticket 889); null where there is
 * neither. One object per act, so a planet change inside an act swaps nothing.
 */
export function heroAtlasOfPlanet(planetIndex: number): HeroAtlasCells | null {
  const act = actOf(planetIndex)
  const known = atlasByAct.get(act.id)
  if (known !== undefined) return known
  const atlas = atlasOfAct(act)
  atlasByAct.set(act.id, atlas)
  return atlas
}

function atlasOfAct(act: OreAct): HeroAtlasCells | null {
  const own = heroAtlasOfAct(act.id)
  if (!holdsGeneratedPlanet(act)) return own
  return { id: act.id, pages: [...(own?.pages ?? []), ...gemCutPagesOf()] }
}

/** Whether any planet of the act draws its generated pool: every act but system 1's first. */
function holdsGeneratedPlanet(act: OreAct): boolean {
  return act.lastPlanet >= GENERATED_POOLS_FIRST_PLANET
}

/** The planet's gem overlay (ticket 889); null for a planet whose gems draw no cut. */
export function gemOverlayOfPlanet(params: PlanetParams): GemOverlay | null {
  return isGeneratedPoolPlanet(params) ? generatedGemOverlayOf(params) : null
}

/** By roster index, slot 1 first; null where the planet's pool binds no species to the slot. */
export function planetKindLooksOf(params: PlanetParams): (KindLook | null)[] {
  return planetRosterOf(params).map((kind, index) => {
    const species = planetSpeciesOf(params, index + 1)
    if (species === null) return null
    return kindLookOfSpecies(species, gemRankOfKind(params, kind), gemCutOfKind(params, kind))
  })
}

/** The library cut a generated gem draws (ticket 889); null for every other kind. */
function gemCutOfKind(params: PlanetParams, kind: KindSlot): string | null {
  return isGeneratedPoolPlanet(params) ? generatedGemCutOf(params, kind.slotId) : null
}

/**
 * The species' look; `gemRank` is its slot's rank among the planet's gems, null for a non-gem;
 * `gemCut` the library cut a generated gem draws its cell from, null for every other kind.
 */
export function kindLookOfSpecies(
  species: Material,
  gemRank: number | null,
  gemCut: string | null = null,
  table: MaterialTable = MATERIALS,
): KindLook {
  return {
    speciesId: species.id,
    silhouette: species.silhouette,
    pattern: species.pattern,
    colour: hueSlotColourOf(hueSlotOf(species, table)),
    rarityLead: rarityLeadOf(species.rarity),
    isHero: species.hero,
    gemRank,
    ...(gemCut === null ? {} : { spriteId: gemCut }),
  }
}

/** Lead 1 (uncommon) first: lead k draws the look of the rarity whose tier offset is k. */
export function rarityLooksByLead(): RarityLook[] {
  return FRAMED_RARITIES.map((_, at) => rarityLookAtLead(at + 1))
}

/** The rarity tier whose tier offset is the lead, as the ores rows name it. */
export function rarityIdOfLead(lead: number): string | null {
  return rarityTiers().find((tier) => tier.tierOffset === lead)?.id ?? null
}

function rarityLookAtLead(lead: number): RarityLook {
  const tier = rarityTiers().find((candidate) => candidate.tierOffset === lead)
  const look = RARITY_LOOKS.find((row) => row.rarity === tier?.id)
  if (look === undefined) throw new Error(`no rarity look draws the tier offset ${lead}`)
  return { tint: look.tint, frame: look.frame, glow: look.glow, pulse: look.pulse }
}

function hasMetSpecies(state: AuthorityState, playerId: string, speciesId: string): boolean {
  return hasDiscovered(state, playerId, `material:${speciesId}`, NEVER_MET)
}

function hueSlotOf(species: Material, table: MaterialTable) {
  const slot = table.hueSlots.find((hueSlot) => hueSlot.id === species.hueSlot)
  if (slot === undefined) throw new Error(`${species.id} names no hue slot of the table`)
  return slot
}

function rarityLeadOf(rarity: string): number {
  const tier = rarityTiers().find((candidate) => candidate.id === rarity)
  if (tier === undefined) throw new Error(`no rarity tier is named ${rarity}`)
  return tier.tierOffset
}
