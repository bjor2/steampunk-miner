/**
 * The ore-visuals slice's public API (docs/standards/feature-slices.md 2.1): the #151 look data
 * and its pure read rules. Types, selectors and constants only; never React, zustand or a store.
 */
export const ORE_VISUALS_SLICE_ID = 'ore-visuals'

export type {
  OreAtlasRules,
  OreEmissionHue,
  OreFamilyLook,
  OreGradeRules,
  OreLightSlotRules,
  OreLooks,
  PlanetTintRules,
  ShaderSilhouette,
  VisualEchoRules,
} from './systems/oreFamilyLooks'
export {
  ORE_GRADE_COUNT,
  ORE_LOOKS,
  oreAtlasCellCapacityOf,
  oreAtlasCellCountOf,
  oreFamilyLookOf,
  oreLookProblems,
} from './systems/oreFamilyLooks'
export type { OreAtlasCell } from './systems/oreAtlasLayout'
export { oreAtlasCellOf, oreAtlasCellsOf, oreAtlasCellsPerRowOf } from './systems/oreAtlasLayout'
export type { OreGradeChannel, VisualEcho } from './systems/oreGradeChannels'
export {
  ORE_GRADE_CHANNELS,
  oreGlowOf,
  oreGradeChannelsOf,
  oreHitParticlesOf,
  oreSparklesOf,
  oreStrengthOf,
  visualEchoOf,
} from './systems/oreGradeChannels'
export { oreBodyColourOf, oreGlowColourOf, oreHueOf } from './systems/render/oreColour'
export { oreLookOfCell, oreLookOfType, oreVariantOf } from './systems/render/oreLookProvider'
