import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import type { CommandIntent } from '../authority/authorityCommand'
import { createScriptedSession, type ScriptedSession } from '../authority/scriptedSession'
import { div, fromSafeInteger, toCanonical } from '../money'
import type { VehicleItem } from '../registries/vehicleLoadout'
import { selectUpgradeBayModel, type UpgradeBayModel } from './upgradeBayModel'

// The Upgrade bay's vehicle item rows (ticket 248): a fake slice sells one researched item at a
// price with milli digits, so the card's price and the debit are compared to the milli.

const LANTERN = 'bay-probe.lantern'
const LOCKED = 'bay-probe.locked'

/** 1234.567: a price the formatter rounds, so only the exact string can match the debit. */
const LANTERN_PRICE = div(fromSafeInteger(1234567), fromSafeInteger(1000))

function itemOf(id: string): VehicleItem {
  return { id, iconId: `icon-${id}`, slots: ['powerup.1'], attach: null }
}

const BAY_PROBE: SliceDefinition = {
  id: 'bay-probe',
  register(r) {
    r.content('vehicle-item', [itemOf(LANTERN), itemOf(LOCKED)])
    r.vehicleItemSeller({
      id: 'bay-probe.seller',
      offerOf: () => ({ name: 'Probe lantern', price: LANTERN_PRICE }),
    })
    r.vehicleItemResearch({
      id: 'bay-probe.research',
      isResearched: (_state, _playerId, itemId) => itemId === LANTERN,
    })
  },
}

function dockedWith(money: string): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  session.submit(0, { type: 'debug.grantMoney', payload: { amount: money } })
  return session
}

function bayOf(session: ScriptedSession): UpgradeBayModel {
  return selectUpgradeBayModel(session.state(), 'p1', {
    isTravelArmed: false,
    isQuickServiceHighlighted: false,
    focusedId: null,
    installingUpgradeId: null,
  })
}

function intentOf(bay: UpgradeBayModel): CommandIntent {
  const action = bay.items[0].buy.action
  if (action.kind !== 'submit') throw new Error('the item row buys through a command')
  return action.intent
}

describe('the Upgrade bay vehicle item rows (ticket 248)', () => {
  it('shows a row only for the researched item, before it is bought', () =>
    withRegistrations([BAY_PROBE], () => {
      expect(bayOf(dockedWith('5000')).items.map((row) => row.itemId)).toEqual([LANTERN])
    }))

  it('charges exactly the price its card shows, to the milli', () =>
    withRegistrations([BAY_PROBE], () => {
      const session = dockedWith('5000')
      const bay = bayOf(session)
      const [event] = session.submit(1, intentOf(bay))
      expect(event).toMatchObject({ type: 'VehicleItemPurchased', itemId: LANTERN })
      const debit = event.type === 'VehicleItemPurchased' ? event.price : null
      expect(bay.items[0].card.cost?.exact).toBe(debit)
      expect(debit).toBe(toCanonical(LANTERN_PRICE))
    }))

  it('drops the row once the item is owned', () =>
    withRegistrations([BAY_PROBE], () => {
      const session = dockedWith('5000')
      session.submit(1, intentOf(bayOf(session)))
      expect(bayOf(session).items).toEqual([])
    }))

  it('marks the row money short when the wallet cannot pay', () =>
    withRegistrations([BAY_PROBE], () => {
      const [row] = bayOf(dockedWith('1000')).items
      expect(row.buyState).toBe('money_short')
      expect(row.card.isMoneyShort).toBe(true)
    }))

  it('lets the focus reach the row between the bay rows and repair', () =>
    withRegistrations([BAY_PROBE], () => {
      const bay = bayOf(dockedWith('5000'))
      const panels = bay.focusStops.map((stop) => stop.panel)
      expect(panels.indexOf('items')).toBe(panels.indexOf('repair') - 1)
    }))
})
