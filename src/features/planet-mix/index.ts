/**
 * The planet-mix slice's public API (feature-slices.md 2.1, #141 "Slice and contract"): each
 * planet's ore mix per band, its act (`oreThemeId`) and the families' `gateClass`. Types, pure
 * selectors and constants only; never React, zustand or a store. #141 named the slice
 * `ore-distribution`; the folder is #155's `planet-mix`.
 */
export const PLANET_MIX_SLICE_ID = 'planet-mix'

export type { OreMix, OreMixEntry } from './systems/oreMix'
export { oreMixFor, oreMixNearLavaOf, oreMixOf, PLANET_MIX_HOOK_ID } from './systems/oreMix'
export { bandValueMultiplierOf, signatureValueShareOf } from './systems/mixValue'
export type { OreAct } from './systems/themeRows'
export { actOf, gateClassOf } from './systems/planetActs'
export { familyRows, type FamilyRow } from './systems/familyRows'
export type { BandHistogram, ObservedType, PlanetHistogram } from './mixHistogram'
/** #141's `oreMixHistogram(planetIndex, seed)`: the planet generated, its ore tiles per band. */
export { planetHistogramOf as oreMixHistogram } from './mixHistogram'
export { isSignatureOre } from './systems/signatureTag'
