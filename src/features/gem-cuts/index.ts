/**
 * The gem-cuts slice's public API (feature-slices.md 2.1, ticket 889): the append-only gem-cut
 * library, its hue-tinted atlas pages, and the seeded picks of a generated planet's gem cuts and
 * overlay. Types, pure selectors and constants only; never React, zustand or a store.
 */
export const GEM_CUTS_SLICE_ID = 'gem-cuts'

export type { GemCut, GemCutLibrary } from './systems/gemCutLibrary'
export {
  cutsUnder,
  GEM_CUT_ATLAS_ASSET,
  GEM_CUT_LIBRARY,
  gemCutArtAssets,
  gemCutAtlasAssetIdOf,
  gemCutLibraryProblems,
  gemCutOf,
  gemCutPagesOf,
  loadGemCutLibrary,
} from './systems/gemCutLibrary'
export type { PlanetAddress } from './systems/gemCutPick'
export { planetGemCutsOf, planetGemOverlayOf } from './systems/gemCutPick'
