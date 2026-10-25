/**
 * The mineral skins slice's public API (feature-slices.md 2.1, ticket 591 under #576): the layered
 * skin of each species, its table and guards, the planet's skins by roster slot, and the skin of a
 * planet's signature material (ticket 603). Types, pure selectors and constants only; never React,
 * zustand or a store.
 */
export const MINERAL_SKINS_SLICE_ID = 'mineral-skins'

export type {
  MineralSkin,
  SignatureSkin,
  SignatureSkinRow,
  SkinLayer,
  SkinLayerKind,
  SkinRow,
  WornSkin,
} from './systems/skinLayers'
export { SKIN_LAYER_KINDS, sharedSkinProblems } from './systems/skinLayers'
export type { SkinGuardContext, SkinTable } from './systems/skinTable'
export {
  loadSkinTable,
  MINERAL_SKINS,
  skinGuardContext,
  skinTableProblems,
} from './systems/skinTable'
export {
  planetSkinProblems,
  planetSkinsOf,
  seenSignatureSkinOf,
  signatureSkinOf,
  skinOfKindSlot,
  skinOfSpecies,
} from './systems/mineralSkin'
/**
 * The per-act hero atlases (tickets 451 and 852): which hero species each act's atlas holds, page
 * by page, each page's from its skin row.
 */
export type { HeroAtlasRow } from './systems/heroAtlases'
export {
  HERO_ATLASES,
  heroAtlasArtAssets,
  heroAtlasAssetIdOf,
  heroAtlasOfAct,
  heroAtlasRowProblems,
  loadHeroAtlases,
} from './systems/heroAtlases'
export type { SignatureMaterial } from './systems/signatureMaterial'
export { signatureMaterialsByPlanet } from './systems/signatureMaterial'
