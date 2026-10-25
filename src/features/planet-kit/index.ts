/**
 * The planet-kit slice's public API (feature-slices.md 2.1; ticket 820 under spec #647): the P1-P5
 * kit data rows of the GD lock of 24 Oct. Five merchant variants for the #175 dock shops (name,
 * buy list of the planet's own pool, one +25% premium ore, stock) and five kit items (tools and
 * consumables with their effect, trade-off, home planet, sale rule, stack limit and price rule),
 * plus the read selectors the later kit tickets build on: PK2 (#821) merchants, PK4 (#823) items
 * and the stats.json re-pin, PK5 (#824) generator rows. PK2 adds the prices at g and the merchant
 * variant a shop reads (stock rows with their #681 readout, the premium tag and the once-per-ore
 * lift). Types, pure selectors and constants only; never React, zustand or a store.
 */
export const PLANET_KIT_SLICE_ID = 'planet-kit'

export type {
  KitEffect,
  KitItem,
  KitItemKind,
  KitPriceRule,
  KitSale,
  KitTradeOff,
  MerchantRow,
  PlanetKits,
  PremiumOre,
  PricedAt,
  TradeOffCost,
} from './systems/planetKitTypes'
export { KIT_ITEM_KINDS, KIT_SALES, TRADE_OFF_COSTS } from './systems/planetKitRowShape'
export type { PlanetKitEconomy } from './systems/planetKitEconomy'
export { PREMIUM_LIFT_CAP_BP } from './systems/planetKitEconomy'
export type {
  KitPlanetFacts,
  KitSpeciesFacts,
  PlanetKitGuardContext,
} from './systems/planetKitGuards'
export {
  loadPlanetKits,
  PLANET_KITS,
  planetKitGuardContext,
  planetKitProblems,
} from './systems/planetKitRows'
export {
  isKitItemSoldAt,
  kitItemOf,
  kitItemsOfKind,
  merchantOfPlanet,
  premiumTagOf,
  stockedItemsOf,
  stockOfMerchant,
} from './systems/planetKitSales'
export { kitItemPriceAt, kitPriceAtIndex, planetIndexOfKitPlanet } from './systems/planetKitPrices'
export type { MerchantStockRow, MerchantVariant } from './systems/merchantVariant'
export { merchantVariantOf } from './systems/merchantVariant'
export { merchantPremiumLiftOf, premiumSpeciesAt } from './systems/merchantPremium'
export { MERCHANTS_ROW_ID, sessionMerchantOf, sessionPlanetIdOf } from './systems/sessionMerchant'
export type {
  ContainerAccess,
  ContainerDrop,
  ContainerPickup,
  DropOutcome,
  DropRefusal,
  PickupOutcome,
  PickupRefusal,
  PlacedContainer,
  PlacedContainers,
  PlanetContainers,
} from './systems/placedContainers'
export {
  canPickUp,
  CONTAINER_ACCESS,
  containedUnitsOf,
  containerAt,
  containersOn,
  dropContainer,
  dropRefusalOf,
  NO_PLACED_CONTAINERS,
  pickupContainer,
  pickupRefusalOf,
  placedCountOf,
  shownContainersOn,
} from './systems/placedContainers'
export {
  placedContainersOf,
  placedContainersProblems,
  toPortablePlacedContainers,
} from './systems/placedContainersPortable'
export type { ContainerRow } from './systems/containerViews'
export { containerMarkersOf, containerRowsOf } from './systems/containerViews'
export {
  CONTAINER_RULES,
  dropContainerIntent,
  dropRejectionOf,
  pickupContainerIntent,
  pickupRejectionOf,
} from './systems/containerRules'
export { CONTAINERS_SECTION, placedContainersIn } from './systems/containerSection'
export type { ContainerMoveBody } from './systems/containerEvents'
export { contentsValueOf } from './systems/containerEvents'
export type { KitSocket } from './systems/kitSockets'
export { KIT_SOCKETS } from './systems/kitSockets'
