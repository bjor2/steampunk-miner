import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { fromSafeInteger, mul, sub, toCanonical } from '../../../systems/money'
import { withRegistrations } from '../../../registries/registrar'
import { FAKE, FAKE_ITEMS, FAKE_UNIT_PRICE } from '../fakeItems'
import { slice } from '../register'
import { chargesLeftOf } from './chargeState'
import { restockEntriesOf } from './restockBayEntries'
import { restockConsumableIntent } from './restockRules'

// The consumable restock (ticket 394, the GD ruling on #381, option c): an owned consumable's
// stack is bought back to full at the Upgrade bay, each charge at its registered band-ore price on
// the planet it is restocked on; per player, deterministic, and closed to a player who does not own
// it. The fake consumable holds 3 and is restocked at 2 band-5 units; the fake charged item is not.

const SETUP_TICK = 0
const RESTOCK_TICK = 1

type PlayerSetup = 'owner' | 'stranger'

/** Players on planet `planet` at the Upgrade bay with money; an owner has the fake consumable. */
function atUpgradeBay(players: Readonly<Record<string, PlayerSetup>>, planet = 1): ScriptedSession {
  const session = createScriptedSession(Object.keys(players))
  session.submit(SETUP_TICK, { type: 'debug.setPlanet', payload: { planetIndex: planet } })
  for (const [playerId, setup] of Object.entries(players)) {
    const slots: Record<string, string> = setup === 'owner' ? { 'powerup.1': FAKE.consumable } : {}
    session.submit(SETUP_TICK, setVehicleLoadoutCommand(slots), playerId)
    session.submit(SETUP_TICK, teleportToUpgradeBay, playerId)
    session.submit(SETUP_TICK, { type: 'debug.setMoney', payload: { amount: '1e30' } }, playerId)
  }
  return session
}

const teleportToUpgradeBay = { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } } as const

const leaveCharges = (session: ScriptedSession, chargesLeft: number, playerId = 'p1') =>
  session.submit(
    SETUP_TICK,
    { type: 'debug.power-up-core.setCharges', payload: { itemId: FAKE.consumable, chargesLeft } },
    playerId,
  )

const restock = (session: ScriptedSession, itemId: string = FAKE.consumable, playerId = 'p1') =>
  session.submit(RESTOCK_TICK, restockConsumableIntent(itemId), playerId)

const unitPriceOn = (planet: number) => bandOrePriceAt(FAKE_UNIT_PRICE, planet, planet)

const walletOf = (session: ScriptedSession, playerId = 'p1') =>
  session.state().players[playerId].wallet

function rejectionOf(events: readonly DomainEvent[]): string | null {
  const [first] = events
  return first?.type === 'CommandRejected' ? first.reason : null
}

const inRestockField = <T>(body: () => T): T => withRegistrations([slice, FAKE_ITEMS], body)

describe('power-up-core: consumable restock (ticket 394)', () => {
  it('fills the stack to capacity, each missing charge at the unit price on this planet', () =>
    inRestockField(() => {
      const session = atUpgradeBay({ p1: 'owner' }, 4)
      leaveCharges(session, 1)
      const before = walletOf(session)
      const events = restock(session)
      const bill = mul(unitPriceOn(4), fromSafeInteger(2))
      expect(chargesLeftOf(session.state(), 'p1', FAKE.consumable)).toBe(3)
      expect(toCanonical(sub(before, walletOf(session)))).toBe(toCanonical(bill))
      expect(events).toEqual([
        expect.objectContaining({
          type: 'power-up-core.ConsumableRestocked',
          playerId: 'p1',
          itemId: FAKE.consumable,
          count: 2,
          unitPrice: toCanonical(unitPriceOn(4)),
          price: toCanonical(bill),
          chargesLeft: 3,
        }),
      ])
    }))

  it('prices a charge at the planet it is restocked on, never capped', () =>
    inRestockField(() => {
      const prices = [1, 10, 40].map((planet) => {
        const session = atUpgradeBay({ p1: 'owner' }, planet)
        leaveCharges(session, 2)
        const [restocked] = restock(session)
        return restocked.type === 'power-up-core.ConsumableRestocked' ? restocked.price : null
      })
      expect(prices).toEqual([1, 10, 40].map((planet) => toCanonical(unitPriceOn(planet))))
    }))

  it('restocks only the player who sends it, from their own wallet', () =>
    inRestockField(() => {
      const session = atUpgradeBay({ p1: 'owner', p2: 'owner' })
      leaveCharges(session, 0, 'p1')
      leaveCharges(session, 0, 'p2')
      const before = walletOf(session, 'p2')
      restock(session, FAKE.consumable, 'p1')
      expect(chargesLeftOf(session.state(), 'p1', FAKE.consumable)).toBe(3)
      expect(chargesLeftOf(session.state(), 'p2', FAKE.consumable)).toBe(0)
      expect(walletOf(session, 'p2')).toEqual(before)
    }))

  it('reaches the same state from the same commands', () =>
    inRestockField(() => {
      const digestOfRun = () => {
        const session = atUpgradeBay({ p1: 'owner', p2: 'owner' }, 7)
        leaveCharges(session, 1, 'p2')
        restock(session, FAKE.consumable, 'p2')
        return stateDigest(session.state())
      }
      expect(digestOfRun()).toBe(digestOfRun())
    }))

  it('refuses a player who does not own the consumable, and changes nothing', () =>
    inRestockField(() => {
      const session = atUpgradeBay({ p1: 'owner', p2: 'stranger' })
      const before = stateDigest(session.state())
      expect(rejectionOf(restock(session, FAKE.consumable, 'p2'))).toBe('power-up-core.not_owned')
      expect(stateDigest(session.state())).toBe(before)
    }))

  it('refuses a full stack, an item no slice restocks, and a restock away from the bay', () =>
    inRestockField(() => {
      const session = atUpgradeBay({ p1: 'owner' })
      expect(rejectionOf(restock(session))).toBe('power-up-core.stack_full')
      expect(rejectionOf(restock(session, FAKE.charged))).toBe('power-up-core.not_restocked')
      session.submit(SETUP_TICK, { type: 'undock', payload: {} })
      session.submit(SETUP_TICK, { type: 'debug.teleportToDock', payload: { bay: 'sell' } })
      leaveCharges(session, 0)
      expect(rejectionOf(restock(session))).toBe('wrong_bay')
    }))

  it('refuses a wallet short of the whole fill, never trimming it to fewer charges', () =>
    inRestockField(() => {
      const session = atUpgradeBay({ p1: 'owner' }, 10)
      leaveCharges(session, 0)
      const oneCharge = toCanonical(unitPriceOn(10))
      session.submit(SETUP_TICK, { type: 'debug.setMoney', payload: { amount: oneCharge } })
      expect(rejectionOf(restock(session))).toBe('money_short')
      expect(chargesLeftOf(session.state(), 'p1', FAKE.consumable)).toBe(0)
    }))

  it('lists a bay entry only for a restocked consumable the player owns, priced as debited', () =>
    inRestockField(() => {
      const session = atUpgradeBay({ p1: 'owner', p2: 'stranger' }, 4)
      leaveCharges(session, 1)
      const [entry] = restockEntriesOf(session.state(), 'p1')
      expect(restockEntriesOf(session.state(), 'p2')).toEqual([])
      expect(entry).toMatchObject({ levelText: '1/3', effectText: '+2 charges' })
      expect(entry.cost?.exact).toBe(toCanonical(mul(unitPriceOn(4), fromSafeInteger(2))))
      expect(entry.buy?.reason).toBeNull()
    }))
})
