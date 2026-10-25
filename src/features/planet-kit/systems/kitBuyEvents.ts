/**
 * The commands, domain event and rejection reasons buying a kit item adds (feature-slices.md
 * 3.15, ticket 850), by augmentation, never by editing the kernel's lists; and the event body its
 * rule builds. The event names the planet bought on by its stable id (s, p), the g its price and a
 * consumable's pin were read at, the price paid and how many of the item the player now holds.
 * A debug grant (ticket 881) answers with the price the item has at its home planet's g.
 */
import { toCanonical, type Money } from '../../../systems/money'
import { toIndexText } from '../../../systems/starMap/planetAddress'
import type { PlanetId } from '../../solar-systems'
import { campaignIndexOf } from './planetKitSales'
import type { KitItem } from './planetKitTypes'

declare module '../../../systems/authority/authorityCommand' {
  interface CommandPayloads {
    /** Buy one of a kit item from the merchant on this planet, at the Sell bay. */
    'planet-kit.buy_kit_item': { itemId: string }
    /**
     * A scenario's kit item: a tool owned, or one more consumable bought at this planet's g, as if
     * bought here, with no money spent.
     */
    'debug.planet-kit.grantKitItem': { itemId: string }
  }
}

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    'planet-kit.KitItemBought': {
      playerId: string
      itemId: string
      kind: string
      /** The planet bought on, (s, p) as canonical index text. */
      system: string
      place: string
      /** The g the price was read at for a consumable, and its pin; the planet's g for a tool. */
      g: string
      price: string
      /** The units of the item held now, as decimal text: 1 for a tool. */
      held: string
    }
    /**
     * A scenario's grant, with the price it debits in the run's ledger (ticket 881, the VS's
     * condition on #850): the item's price at its home planet's g, so a tools-on run's payback
     * divides by what the tool would have cost.
     */
    'planet-kit.KitItemGranted': {
      playerId: string
      itemId: string
      /** The home planet's g the price was read at, as index text. */
      g: string
      price: string
    }
  }
  interface RejectionReasons {
    'planet-kit.unknown_kit_item': true
    'planet-kit.no_merchant': true
    'planet-kit.not_sold_here': true
    'planet-kit.kit_tool_owned': true
    'planet-kit.stack_full': true
    'planet-kit.held_from_sale': true
    'planet-kit.no_crate': true
  }
}

export interface KitPurchase {
  playerId: string
  item: KitItem
  planet: PlanetId
  g: bigint
  price: Money
  held: bigint
}

export function kitItemBoughtOf(purchase: KitPurchase) {
  return {
    type: 'planet-kit.KitItemBought' as const,
    playerId: purchase.playerId,
    itemId: purchase.item.id,
    kind: purchase.item.kind,
    system: purchase.planet.system,
    place: purchase.planet.planet,
    g: toIndexText(purchase.g),
    price: toCanonical(purchase.price),
    held: purchase.held.toString(),
  }
}

export function kitItemGrantedOf(playerId: string, item: KitItem, price: Money) {
  return {
    type: 'planet-kit.KitItemGranted' as const,
    playerId,
    itemId: item.id,
    g: toIndexText(campaignIndexOf(item.homePlanet)),
    price: toCanonical(price),
  }
}
