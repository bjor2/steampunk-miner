/**
 * The ores slice's public API (feature-slices.md 2.1, #140 "Slice and contract"): the ore
 * catalogue, its tier formula, the rarity lead weights and roll, and the families of the cell's
 * family field. Types, pure selectors and constants only; never React, zustand or a store.
 * Value and hardness by tier stay kernel (`oreEconomy`) and are passed through unchanged.
 */
export const ORES_SLICE_ID = 'ores'

export type { CatalogueOre } from './systems/oreCatalogue'
export {
  echoOf,
  familyOfCellCode,
  gradeOf,
  leadWeights,
  oreFamilies,
  oreTierOf,
  oreTypeOf,
  variantOf,
} from './systems/oreCatalogue'
export type { CatalogueKnobs, LeadWeights, OreFamily } from './systems/oreRows'
export { ORE_ROWS } from './systems/oreRows'
export { leadOfCell, leadOfPatch, ORE_LEAD_HOOK_ID, oreLeadHook } from './systems/leadRoll'
export {
  lastCampaignOreTier,
  ORE_TYPE_PROVIDER_ID,
  oreTypeProvider,
} from './systems/oreTypeProvider'
export { oreHardness, oreSalePrice, oreValue } from '../../systems/economy/oreEconomy'
