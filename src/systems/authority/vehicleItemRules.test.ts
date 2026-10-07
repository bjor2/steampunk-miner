import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { fromSafeInteger, toCanonical } from '../money'
import type { VehicleItemOffer } from '../registries/vehicleItemSales'
import type { VehicleItem } from '../registries/vehicleLoadout'
import type { BayId } from '../world/dockBays'
import type { DomainEvent } from './domainEvent'
import { buyVehicleItemCommand } from './loadoutCommands'
import { ownsItem } from './loadoutRules'
import { createScriptedSession, type ScriptedSession } from './scriptedSession'
import { vehicleItemsOnSale } from './vehicleItemRules'

// The buy path for tech-unlocked vehicle items (ticket 248): a fake slice registers the items, a
// seller and the research answer, so no real slice is imported.

const GRAPPLE = 'shop-probe.grapple'
const BOOST = 'shop-probe.boost'
const FLARE = 'shop-probe.flare'

/** A whole amount as the log and the wallet's canonical string read it. */
const canonical = (amount: number) => toCanonical(fromSafeInteger(amount))

function itemOf(id: string): VehicleItem {
  return { id, iconId: `icon-${id}`, slots: ['powerup.1', 'powerup.2'], attach: null }
}

/** The probe sells the grapple and the boost; the flare is a consumable it leaves to restock. */
const OFFERS: Readonly<Record<string, VehicleItemOffer>> = {
  [GRAPPLE]: { name: 'Probe grapple', price: fromSafeInteger(250) },
  [BOOST]: { name: 'Probe boost', price: fromSafeInteger(90) },
}

/** The grapple and the flare are researched; the boost's node is not. */
const RESEARCHED: readonly string[] = [GRAPPLE, FLARE]

const SHOP_PROBE: SliceDefinition = {
  id: 'shop-probe',
  register(r) {
    r.content('vehicle-item', [GRAPPLE, BOOST, FLARE].map(itemOf))
    r.vehicleItemSeller({ id: 'shop-probe.seller', offerOf: (itemId) => OFFERS[itemId] ?? null })
    r.vehicleItemResearch({
      id: 'shop-probe.research',
      isResearched: (_state, _playerId, itemId) => RESEARCHED.includes(itemId),
    })
  },
}

/** Docked at `bay` with `money` in the wallet. */
function dockedWith(money: string, bay: BayId = 'upgrade'): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay } })
  session.submit(0, { type: 'debug.grantMoney', payload: { amount: money } })
  return session
}

function buy(session: ScriptedSession, itemId: string): DomainEvent[] {
  return session.submit(1, buyVehicleItemCommand(itemId))
}

const walletOf = (session: ScriptedSession) => toCanonical(session.state().players.p1.wallet)

function refusalOf(events: readonly DomainEvent[]) {
  const [event] = events
  return event.type === 'CommandRejected' ? event.reason : null
}

describe('buying a vehicle item at the Upgrade bay (ticket 248)', () => {
  it('debits the offer, owns the item and logs the purchase with its price', () =>
    withRegistrations([SHOP_PROBE], () => {
      const session = dockedWith('1000')
      const events = buy(session, GRAPPLE)
      expect(events).toMatchObject([
        { type: 'VehicleItemPurchased', itemId: GRAPPLE, price: canonical(250) },
      ])
      expect(walletOf(session)).toBe(canonical(750))
      expect(ownsItem(session.state(), 'p1', GRAPPLE)).toBe(true)
    }))

  it('refuses an item no slice registered, a vision row, and spends nothing', () =>
    withRegistrations([SHOP_PROBE], () => {
      const session = dockedWith('1000')
      expect(refusalOf(buy(session, 'shop-probe.vision_row'))).toBe('unknown_vehicle_item')
      expect(walletOf(session)).toBe(canonical(1000))
    }))

  it('refuses an item whose node is not researched, and spends nothing', () =>
    withRegistrations([SHOP_PROBE], () => {
      const session = dockedWith('1000')
      expect(refusalOf(buy(session, BOOST))).toBe('not_researched')
      expect(walletOf(session)).toBe(canonical(1000))
      expect(ownsItem(session.state(), 'p1', BOOST)).toBe(false)
    }))

  it('refuses a researched item no slice sells here', () =>
    withRegistrations([SHOP_PROBE], () => {
      expect(refusalOf(buy(dockedWith('1000'), FLARE))).toBe('not_for_sale')
    }))

  it('refuses a second buy of an owned item', () =>
    withRegistrations([SHOP_PROBE], () => {
      const session = dockedWith('1000')
      buy(session, GRAPPLE)
      expect(refusalOf(buy(session, GRAPPLE))).toBe('vehicle_item_owned')
      expect(walletOf(session)).toBe(canonical(750))
    }))

  it('refuses away from the Upgrade bay', () =>
    withRegistrations([SHOP_PROBE], () => {
      expect(refusalOf(buy(dockedWith('1000', 'sell'), GRAPPLE))).toBe('wrong_bay')
    }))

  it('refuses when the wallet is short of the offer', () =>
    withRegistrations([SHOP_PROBE], () => {
      const session = dockedWith('249')
      expect(refusalOf(buy(session, GRAPPLE))).toBe('money_short')
      expect(walletOf(session)).toBe(canonical(249))
    }))

  it('refuses every item while no research provider is registered', () =>
    withRegistrations([{ ...SHOP_PROBE, register: registerWithoutResearch }], () => {
      expect(refusalOf(buy(dockedWith('1000'), GRAPPLE))).toBe('not_researched')
    }))
})

describe('vehicle items on sale (ticket 248)', () => {
  it('lists the researched items a slice sells that the vehicle does not own yet', () =>
    withRegistrations([SHOP_PROBE], () => {
      const session = dockedWith('1000')
      expect(onSaleIds(session)).toEqual([GRAPPLE])
      buy(session, GRAPPLE)
      expect(onSaleIds(session)).toEqual([])
    }))

  it('lists nothing with no slice registered', () =>
    withRegistrations([], () => {
      expect(onSaleIds(dockedWith('1000'))).toEqual([])
    }))
})

function registerWithoutResearch(r: Parameters<SliceDefinition['register']>[0]) {
  r.content('vehicle-item', [GRAPPLE, BOOST, FLARE].map(itemOf))
  r.vehicleItemSeller({ id: 'shop-probe.seller', offerOf: (itemId) => OFFERS[itemId] ?? null })
}

function onSaleIds(session: ScriptedSession): string[] {
  return vehicleItemsOnSale(session.state(), 'p1').map(({ item }) => item.id)
}
