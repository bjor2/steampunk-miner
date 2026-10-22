/**
 * The layered skin generator (#576, GD ruling 20 Oct 2026, ticket 591): a species' skin is the
 * four layers its skin row chooses, stacked base, vein, palette, sheen. A planet's skins follow its
 * roster slots through the species its pool binds there (ticket 542), and a species' skin shows
 * from the first frame, met or not (GD ruling on #698, option 2): only its rarity overlay waits for
 * the player to meet it, and the skin names no value. A planet's signature material, the
 * slotless 16th material (#453 E1), wears its planet's signature skin (ticket 603), seen once the
 * player has met its ore under `ore:<ore type id>`, so it is never previewed either. Look only: no
 * price, gate, income, generation or save reads it, and it changes no stored cell.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { hasDiscovered, type DiscoveryFallback } from '../../../systems/registries/discovery'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { planetRosterOf, planetSpeciesOf } from '../../roster'
import { signatureMaterialsByPlanet, type SignatureMaterial } from './signatureMaterial'
import {
  layersOfRow,
  sharedSkinProblems,
  skinOfRow,
  wornSignatureSkinOf,
  wornSpeciesSkinOf,
  type MineralSkin,
  type SignatureSkin,
} from './skinLayers'
import { MINERAL_SKINS, type SkinTable } from './skinTable'

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

const SIGNATURE_MATERIALS: ReadonlyMap<number, SignatureMaterial> = signatureMaterialsByPlanet()

/** The species' skin, layered from its row; null while no row skins it. */
export function skinOfSpecies(
  speciesId: string,
  table: SkinTable = MINERAL_SKINS,
): MineralSkin | null {
  const row = table.skins.find((skin) => skin.species === speciesId)
  return row === undefined ? null : skinOfRow(row)
}

/** By roster index, slot 1 first; null where the slot binds no species or the species no skin. */
export function planetSkinsOf(
  params: PlanetParams,
  table: SkinTable = MINERAL_SKINS,
): (MineralSkin | null)[] {
  return planetRosterOf(params).map((_, index) => skinOfKindSlot(params, index + 1, table))
}

/** The skin of the planet's signature material; null while no row skins it. */
export function signatureSkinOf(
  params: PlanetParams,
  table: SkinTable = MINERAL_SKINS,
): SignatureSkin | null {
  const row = table.signatures.find((signature) => signature.planet === params.planetIndex)
  const material = SIGNATURE_MATERIALS.get(params.planetIndex)
  if (row === undefined || material === undefined) return null
  return { planetIndex: row.planet, oreTypeId: material.oreTypeId, layers: layersOfRow(row) }
}

/** The signature skin the player sees: null until they have met the signature ore. */
export function seenSignatureSkinOf(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  table: SkinTable = MINERAL_SKINS,
): SignatureSkin | null {
  const skin = signatureSkinOf(params, table)
  return skin !== null && hasMetOre(state, playerId, skin.oreTypeId) ? skin : null
}

/** Why two of the planet's materials would look alike; empty when every skin is its own. */
export function planetSkinProblems(
  params: PlanetParams,
  table: SkinTable = MINERAL_SKINS,
): string[] {
  const species = planetSkinsOf(params, table).filter((skin): skin is MineralSkin => skin !== null)
  const signature = signatureSkinOf(params, table)
  return sharedSkinProblems([
    ...species.map(wornSpeciesSkinOf),
    ...(signature === null ? [] : [wornSignatureSkinOf(signature.planetIndex, signature.layers)]),
  ])
}

/** The skin of the species a cell's kind slot binds; null for no species or no skin row. */
export function skinOfKindSlot(
  params: PlanetParams,
  kindSlot: number,
  table: SkinTable = MINERAL_SKINS,
): MineralSkin | null {
  const species = planetSpeciesOf(params, kindSlot)
  return species === null ? null : skinOfSpecies(species.id, table)
}

function hasMetOre(state: AuthorityState, playerId: string, oreTypeId: string): boolean {
  return hasDiscovered(state, playerId, `ore:${oreTypeId}`, NEVER_MET)
}
