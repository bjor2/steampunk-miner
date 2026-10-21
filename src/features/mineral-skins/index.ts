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
  seenSkinOf,
  signatureSkinOf,
  skinOfSpecies,
} from './systems/mineralSkin'
export type { SignatureMaterial } from './systems/signatureMaterial'
export { signatureMaterialsByPlanet } from './systems/signatureMaterial'
