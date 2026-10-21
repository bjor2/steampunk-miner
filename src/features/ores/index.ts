/**
 * The ores slice's public API (feature-slices.md 2.1, #140 "Slice and contract"): the ore
 * catalogue, its tier formula, the rarity lead weights and roll, the rarity tiers with their solved
 * weights and trip clamp (ticket 445), the material kind slots per rarity row set (ticket 446), and
 * the families of the cell's family field. Types, pure
 * selectors and constants only; never React, zustand or a store. Value and hardness by tier stay
 * kernel (`oreEconomy`) and are passed through unchanged.
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
export type { EarlierPool, KindRows, KindSlot } from './systems/kindRows'
export { isSlotLiveInBand, poolOfPlanetUnder } from './systems/kindRows'
export { leadOfCell, leadOfPatch, ORE_LEAD_HOOK_ID, oreLeadHook } from './systems/leadRoll'
export type { RarityRowSet, RarityRows, RarityTier } from './systems/rarityRows'
export {
  isTierLiveIn,
  mixedRowsFromPlanet,
  ORE_RULES_VERSION,
  rarityMultiplierOf,
  rarityRowSetOf,
  rarityTierOf,
  rarityTiers,
  rarityWeightBpOf,
} from './systems/rarityTiers'
export {
  rarityLeadBucketsBpOf,
  rarityLeads,
  rarityRowSetOfPlanet,
  topLeadOf,
} from './systems/rarityLeads'
export type { RaritySolveBand } from './systems/raritySolve'
export { bandMeanValueBpOf, solvedRarityWeightsBp } from './systems/raritySolve'
export type { PaidRarityFind, RarityFind, RarityTrip } from './systems/rarityTripClamp'
export {
  isTripClamped,
  NEW_RARITY_TRIP,
  paidRarityFind,
  rarityTripCapAt,
} from './systems/rarityTripClamp'
export { RARITY_PICKUP_PROVIDER, RARITY_TRIP_RESET } from './systems/rarityPickup'
export type { SavedRarityTrip } from './systems/rarityTripSection'
export {
  FRESH_RARITY_TRIP,
  RARITY_TRIP_SECTION,
  rarityTripOf,
  withRarityTrip,
} from './systems/rarityTripSection'
export {
  lastCampaignOreTier,
  ORE_TYPE_PROVIDER_ID,
  oreTypeProvider,
} from './systems/oreTypeProvider'
export { oreHardness, oreSalePrice, oreValue } from '../../systems/economy/oreEconomy'
