/**
 * The layered skin generator (#576, GD ruling 20 Oct 2026, ticket 591): a species' skin is the
 * four layers its skin row chooses, stacked base, vein, palette, sheen. A planet's skins follow its
 * roster slots through the species its pool binds there (ticket 542), and a player sees a skin only
 * once they have met the species under `material:<species id>` (ticket 546); until then the kind
 * keeps the family look, so nothing previews an unseen species. Look only: no price, gate, income,
 * generation or save reads it, and it changes no stored cell.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { hasDiscovered, type DiscoveryFallback } from '../../../systems/registries/discovery'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { planetRosterOf, planetSpeciesOf } from '../../roster'
import { sharedSkinProblems, skinOfRow, type MineralSkin } from './skinLayers'
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

/** The skin a cell's kind slot shows the player: null until they have met its species. */
export function seenSkinOf(
  state: AuthorityState,
  playerId: string,
  params: PlanetParams,
  kindSlot: number,
  table: SkinTable = MINERAL_SKINS,
): MineralSkin | null {
  const skin = skinOfKindSlot(params, kindSlot, table)
  return skin !== null && hasMetSpecies(state, playerId, skin.speciesId) ? skin : null
}

/** Why two of the planet's species would look alike; empty when every skin is its own. */
export function planetSkinProblems(
  params: PlanetParams,
  table: SkinTable = MINERAL_SKINS,
): string[] {
  const skins = planetSkinsOf(params, table).filter((skin): skin is MineralSkin => skin !== null)
  return sharedSkinProblems(skins)
}

function skinOfKindSlot(
  params: PlanetParams,
  kindSlot: number,
  table: SkinTable,
): MineralSkin | null {
  const species = planetSpeciesOf(params, kindSlot)
  return species === null ? null : skinOfSpecies(species.id, table)
}

function hasMetSpecies(state: AuthorityState, playerId: string, speciesId: string): boolean {
  return hasDiscovered(state, playerId, `material:${speciesId}`, NEVER_MET)
}
