/**
 * The Cache Crate as the pacing bot plays it (ticket 850; the TD's Q4 seam on #850): the kernel's
 * `botCrates` provider. The bot buys crates with the merchant panel's own command where the crate
 * is sold (Hearthmoor, planet 1), drops its hold with the drop control's, and lifts its own crates
 * on the session's planet, oldest first, with the list's pickup. The authority decides each; the
 * bot only sends what a dry run accepts, and only under `kitPolicy.crates: 'drop_on_full'`.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { BotCrate, BotCrateProvider } from '../../../systems/registries/botCrates'
import { cargoUnitsOf } from '../../../systems/vehicle/vehicleState'
import { dropContainerIntent, pickupContainerIntent } from './containerRules'
import { placedContainersIn, sessionPlanetKeyOf } from './containerSection'
import { DROPPED_KIND } from './containerViews'
import { buyKitItemIntent, priceHere } from './kitBuyRules'
import { containersOn, type PlacedContainer } from './placedContainers'
import { PLANET_KITS } from './planetKitRows'
import { isKitItemSoldAt, kitItemOf } from './planetKitSales'
import type { KitItem } from './planetKitTypes'
import { sessionPlanetIdOf } from './sessionMerchant'

const CRATE = kitItemOf(PLANET_KITS, DROPPED_KIND) as KitItem

export const PLANET_KIT_BOT_CRATES: BotCrateProvider = {
  id: 'planet-kit.cache-crate',
  restockIntentOf: (state) => (isCrateSoldHere(state) ? buyKitItemIntent(CRATE.id) : null),
  restockCostOf: (state) => priceHere(state, CRATE),
  dropIntentOf: () => dropContainerIntent(CRATE.id),
  cratesOf: (state, playerId) => ownCratesHere(state, playerId).map(botCrateOf),
}

function isCrateSoldHere(state: AuthorityState): boolean {
  return isKitItemSoldAt(CRATE, sessionPlanetIdOf(state))
}

/** The player's own crates with cargo on the session's planet, in id order: oldest first. */
function ownCratesHere(state: AuthorityState, playerId: string): PlacedContainer[] {
  return containersOn(placedContainersIn(state), sessionPlanetKeyOf(state)).filter((container) =>
    isOwnLoadedCrate(container, playerId),
  )
}

function isOwnLoadedCrate(container: PlacedContainer, playerId: string): boolean {
  const isOwnCrate = container.ownerId === playerId && container.kind === CRATE.id
  return isOwnCrate && cargoUnitsOf(container.cargo) > 0n
}

function botCrateOf(container: PlacedContainer): BotCrate {
  return { cell: container.cell, pickupIntent: pickupContainerIntent(container.containerId) }
}
