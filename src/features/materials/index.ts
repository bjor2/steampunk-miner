/**
 * The materials slice's public API (feature-slices.md 2.1, ticket 444 under #139): the species
 * table under the 12 ore families, its loader and guards. Types, pure selectors and constants
 * only; never React, zustand or a store.
 */
export const MATERIALS_SLICE_ID = 'materials'

export type {
  HueSlot,
  Material,
  MaterialGuardContext,
  MaterialTable,
} from './systems/materialTable'
export {
  loadMaterialTable,
  MATERIALS,
  materialGateClassOf,
  materialGuardContext,
  materialTableProblems,
} from './systems/materialTable'
export type { MaterialRarity } from './systems/materialRowShape'
export { MATERIAL_RARITIES } from './systems/materialRowShape'
export {
  MATERIAL_FLAVOUR_MAX_WORDS,
  MATERIAL_NAME_MAX_WORDS,
  materialNameOf,
  speciesNameOf,
} from './systems/materialCopyRules'
export type { MaterialRarityLook } from './systems/render/rarityLooks'
export { FRAMED_RARITIES, RARITY_LOOKS, rarityLookProblems } from './systems/render/rarityLooks'
export { hueSlotColourOf } from './systems/render/hueSlotColour'
/** The per-act hero atlases (ticket 451): which hero species each act's atlas holds, by cell. */
export {
  HERO_ATLASES,
  heroAtlasArtAssets,
  heroAtlasAssetIdOf,
  heroAtlasOfAct,
  heroAtlasRowProblems,
} from './systems/render/heroAtlases'
