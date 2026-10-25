/**
 * Buying a kit item (ticket 850, PK4b; the GD lock on #823 and its Systems rows): the host command
 * `planet-kit.buy_kit_item {itemId}` at the Sell bay, where the merchant's panel stands. No tree
 * research is asked: the merchants sell for money alone. A tool is owned for good; a consumable
 * joins the stack of the g it is bought at, up to its carry limit. The price is the merchant's
 * (`kitItemPriceAt`: `share · R(g) · paceScale(g)` for a tool at its home g, a consumable at the
 * buyer's g, rounded up per #681), the one the panel shows.
 *
 * In order it is refused when the id is no kit item (`unknown_kit_item`), the vehicle is not
 * docked at the Sell bay, no merchant trades on this planet (`no_merchant`), this merchant does not
 * stock it (`not_sold_here`), the player already owns the tool (`kit_tool_owned`) or carries the
 * most of the consumable (`stack_full`), the item is held from sale (`held_from_sale`: the GD's ship
 * rule on #850 keeps the four hazard tools off sale until their verbs land, #882), or the wallet is
 * short. A refused command changes nothing.
 * It is answered by `planet-kit.KitItemBought`.
 *
 * `debug.planet-kit.grantKitItem {itemId}` holds the item as if bought here, spending nothing; it
 * is refused for an unknown item or one the player may not hold one more of, never trimmed. It
 * answers `planet-kit.KitItemGranted` with the item's price at its home planet's g, the debit a
 * tools-on run's ledger carries (ticket 881, the VS's condition on #850).
 */
import { withWallet, type AuthorityState } from '../../../systems/authority/authorityState'
import {
  firstRejection,
  rejectionOf,
  type Rejection,
  type RuleEffect,
} from '../../../systems/authority/commandRule'
import { atBayRejection } from '../../../systems/authority/dockRules'
import { moneyShortRejection } from '../../../systems/authority/platformServices'
import { sub } from '../../../systems/money'
import type { SliceCommandRules } from '../../../systems/registries/commandRules'
import type { PlanetId } from '../../solar-systems'
import { kitItemBoughtOf, kitItemGrantedOf } from './kitBuyEvents'
import {
  kitBuyRefusalOf,
  unitsHeldOf,
  withConsumableBought,
  withKitToolOwned,
  type KitHoldings,
} from './kitHoldings'
import { kitHoldingsOf, withKitHoldings } from './kitHoldingsSection'
import { kitItemPriceAt } from './planetKitPrices'
import { PLANET_KITS } from './planetKitRows'
import { campaignIndexOf, isKitItemSoldAt, kitItemOf } from './planetKitSales'
import type { KitItem } from './planetKitTypes'
import { sessionMerchantOf, sessionPlanetIdOf } from './sessionMerchant'

export const KIT_BUY_RULES: SliceCommandRules = {
  'planet-kit.buy_kit_item': {
    fields: { itemId: 'text' },
    reject: (state, { playerId, payload }) => kitBuyRejectionOf(state, playerId, payload.itemId),
    apply: (state, { playerId, payload }) =>
      buyKitItem(state, playerId, kitItemOf(PLANET_KITS, payload.itemId) as KitItem),
  },
  'debug.planet-kit.grantKitItem': {
    fields: { itemId: 'text' },
    reject: (state, { playerId, payload }) =>
      firstRejection([
        () => unknownItemRejection(payload.itemId),
        () => holdingRejection(state, playerId, kitItemOf(PLANET_KITS, payload.itemId) as KitItem),
      ]),
    apply: (state, { playerId, payload }) =>
      grantKitItem(state, playerId, kitItemOf(PLANET_KITS, payload.itemId) as KitItem),
  },
}

/** The intent the merchant panel's Buy sends. */
export function buyKitItemIntent(itemId: string) {
  return { type: 'planet-kit.buy_kit_item' as const, payload: { itemId } }
}

/** Why buying `itemId` would be refused now, in the order above; null when it would land. */
export function kitBuyRejectionOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): Rejection | null {
  const item = kitItemOf(PLANET_KITS, itemId)
  return firstRejection([
    () => unknownItemRejection(itemId),
    () => atBayRejection(state, playerId, 'sell'),
    () => noMerchantRejection(state),
    () => notSoldHereRejection(item as KitItem, sessionPlanetIdOf(state)),
    () => holdingRejection(state, playerId, item as KitItem),
    () => heldFromSaleRejection(item as KitItem),
    () => moneyShortRejection(state.players[playerId].wallet, priceHere(state, item as KitItem)),
  ])
}

/** What the merchant here asks for `item`. */
export function priceHere(state: AuthorityState, item: KitItem) {
  return kitItemPriceAt(item, sessionPlanetIdOf(state))
}

function buyKitItem(state: AuthorityState, playerId: string, item: KitItem): RuleEffect {
  const price = priceHere(state, item)
  const held = withItemHeld(state, playerId, item)
  const planet = sessionPlanetIdOf(state)
  return {
    state: withWallet(held, playerId, sub(state.players[playerId].wallet, price)),
    events: [
      kitItemBoughtOf({
        playerId,
        item,
        planet,
        g: campaignIndexOf(planet),
        price,
        held: unitsHeldOf(kitHoldingsOf(held, playerId), item),
      }),
    ],
  }
}

/** Held as if bought here, debiting the run's ledger at the home price (`KitItemGranted`). */
function grantKitItem(state: AuthorityState, playerId: string, item: KitItem): RuleEffect {
  return {
    state: withItemHeld(state, playerId, item),
    events: [kitItemGrantedOf(playerId, item, kitItemPriceAt(item, item.homePlanet))],
  }
}

function withItemHeld(state: AuthorityState, playerId: string, item: KitItem): AuthorityState {
  const g = campaignIndexOf(sessionPlanetIdOf(state))
  return withKitHoldings(state, playerId, heldWith(kitHoldingsOf(state, playerId), item, g))
}

function heldWith(holdings: KitHoldings, item: KitItem, g: bigint): KitHoldings {
  return item.kind === 'tool'
    ? withKitToolOwned(holdings, item.id)
    : withConsumableBought(holdings, item.id, g)
}

function unknownItemRejection(itemId: string): Rejection | null {
  if (kitItemOf(PLANET_KITS, itemId) !== null) return null
  return rejectionOf('planet-kit.unknown_kit_item', `${itemId} is no kit item`)
}

function noMerchantRejection(state: AuthorityState): Rejection | null {
  if (sessionMerchantOf(PLANET_KITS, state) !== null) return null
  return rejectionOf('planet-kit.no_merchant', 'no merchant trades on this planet')
}

function notSoldHereRejection(item: KitItem, planet: PlanetId): Rejection | null {
  if (isKitItemSoldAt(item, planet)) return null
  return rejectionOf(
    'planet-kit.not_sold_here',
    `${item.id} is not sold on planet ${planet.system}:${planet.planet}`,
  )
}

function heldFromSaleRejection(item: KitItem): Rejection | null {
  if (!PLANET_KITS.heldFromSale.has(item.id)) return null
  return rejectionOf('planet-kit.held_from_sale', `${item.id} is not on sale until its verb lands`)
}

function holdingRejection(state: AuthorityState, playerId: string, item: KitItem) {
  const refusal = kitBuyRefusalOf(kitHoldingsOf(state, playerId), item)
  if (refusal === null) return null
  return rejectionOf(
    `planet-kit.${refusal}`,
    refusal === 'kit_tool_owned'
      ? `the player already owns ${item.id}`
      : `the player already carries ${item.stackLimit} ${item.id}`,
  )
}
