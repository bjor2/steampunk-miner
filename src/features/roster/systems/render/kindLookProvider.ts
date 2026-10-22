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
 * Heroes (ticket 451): the atlas of the planet's act, from the materials slice, one object per
 * act, so the terrain swaps it only when a planet change crosses into another act.
 */
import type { AuthorityState } from '../../../../systems/authority/authorityState'
import { hasDiscovered, type DiscoveryFallback } from '../../../../systems/registries/discovery'
import type { KindLookProvider } from '../../../../systems/registries/kindLook'
import type { HeroAtlasCells } from '../../../../systems/render/heroAtlas'
import type { KindLook, RarityLook } from '../../../../systems/render/kindLookTable'
import type { PlanetParams } from '../../../../systems/world/planetParams'
import {
  FRAMED_RARITIES,
  heroAtlasOfAct,
  hueSlotColourOf,
  MATERIALS,
  RARITY_LOOKS,
  type Material,
  type MaterialTable,
} from '../../../materials'
import { rarityTiers } from '../../../ores'
import { actOf } from '../../../planet-mix'
import { planetRosterOf } from '../planetRoster'
import { planetSpeciesOf } from '../planetSpecies'

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
}

/** The atlas of the act holding the planet; null where the act has none. */
export function heroAtlasOfPlanet(planetIndex: number): HeroAtlasCells | null {
  return heroAtlasOfAct(actOf(planetIndex).id)
}

/** By roster index, slot 1 first; null where the planet's pool binds no species to the slot. */
export function planetKindLooksOf(params: PlanetParams): (KindLook | null)[] {
  return planetRosterOf(params).map((_, index) => {
    const species = planetSpeciesOf(params, index + 1)
    return species === null ? null : kindLookOfSpecies(species)
  })
}

export function kindLookOfSpecies(species: Material, table: MaterialTable = MATERIALS): KindLook {
  return {
    speciesId: species.id,
    silhouette: species.silhouette,
    pattern: species.pattern,
    colour: hueSlotColourOf(hueSlotOf(species, table)),
    rarityLead: rarityLeadOf(species.rarity),
    isHero: species.hero,
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
