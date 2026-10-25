/**
 * Each planet's own kit as the pacing bot buys it (ticket 826, PK7; the GD lock of 24 Oct on
 * per-planet identity P1-P5): the kernel's `botKitBuys` provider. On the planet a kit item calls
 * home, the bot buys it with the merchant panel's own command: the tool once (the plough on P2,
 * the tongs on P4, the vane on P5), the consumable up to its carry limit (the flask on P3). The
 * Cache Crate, P1's own, is left to the crate policy, which restocks and drops it
 * (`botCrates.ts`), so a merchants-on run with crates off never carries a crate it cannot use.
 * The authority decides each buy; the bot sends only what a dry run accepts, and only under
 * `kitPolicy.merchant: 'buy_local_kit'`.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import type { BotKitBuy, BotKitBuyProvider } from '../../../systems/registries/botKitBuys'
import { DROPPED_KIND } from './containerViews'
import { buyKitItemIntent, priceHere } from './kitBuyRules'
import { kitBuyRefusalOf } from './kitHoldings'
import { kitHoldingsOf } from './kitHoldingsSection'
import { PLANET_KITS } from './planetKitRows'
import { isSamePlanet } from './planetKitSales'
import type { KitItem } from './planetKitTypes'
import { sessionPlanetIdOf } from './sessionMerchant'

export const PLANET_KIT_BOT_KIT_BUYS: BotKitBuyProvider = {
  id: 'planet-kit.local-kit',
  localBuyOf: (state, playerId) => {
    const item = localItemsOf(state).find((local) => mayHoldOneMore(state, playerId, local))
    return item === undefined ? null : buyOf(state, item)
  },
}

/** The kit items calling the session's planet home, in row order, the crate left out. */
export function localItemsOf(state: AuthorityState): KitItem[] {
  const planet = sessionPlanetIdOf(state)
  return PLANET_KITS.items.filter(
    (item) => isSamePlanet(item.homePlanet, planet) && item.id !== DROPPED_KIND,
  )
}

function mayHoldOneMore(state: AuthorityState, playerId: string, item: KitItem): boolean {
  const isOnSale = !PLANET_KITS.heldFromSale.has(item.id)
  return isOnSale && kitBuyRefusalOf(kitHoldingsOf(state, playerId), item) === null
}

function buyOf(state: AuthorityState, item: KitItem): BotKitBuy {
  return { intent: buyKitItemIntent(item.id), cost: priceHere(state, item) }
}
