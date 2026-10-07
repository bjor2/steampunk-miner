import { describe, expect, it } from 'vitest'
import { rackSlotPrice } from '../../economy/blastingCharges'
import { chargePrice } from '../../economy/chargeSizes'
import { toCanonical } from '../../money'
import { createAuthorityState } from '../authorityState'
import { applyCommand, type CommandOutcome } from '../applyCommand'
import type { CommandIntent } from '../authorityCommand'
import { WORLD_SEED } from '../scriptedSession'
import { setChargesIntent } from './chargeFixtures'

const RACK_SLOT: CommandIntent<'buyChargeRackSlot'> = {
  type: 'buyChargeRackSlot',
  payload: { chain: 0 },
}

function restock(size: number, count: number): CommandIntent<'restockCharges'> {
  return { type: 'restockCharges', payload: { size, count } }
}

/** A session on `planetIndex` with money, docked at one bay, answering each intent's events. */
function shopOn(planetIndex: number, bay: 'sell' | 'upgrade' = 'upgrade', money = '1e30') {
  let outcome: CommandOutcome = {
    state: createAuthorityState({ planetIndex, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
    events: [],
  }
  let seq = 0
  const submit = (intent: CommandIntent) => {
    seq += 1
    outcome = applyCommand(outcome.state, { playerId: 'p1', tick: seq, seq, ...intent })
    return outcome.events
  }
  submit({ type: 'debug.setMoney', payload: { amount: money } })
  submit({ type: 'debug.teleportToDock', payload: { bay } })
  return { submit, charges: () => outcome.state.players.p1.vehicle.charges }
}

describe('blasting charges at the Upgrade bay (#109)', () => {
  it('sells no charges before planet 7', () => {
    const shop = shopOn(6)
    expect(shop.submit(restock(1, 1))).toMatchObject([{ reason: 'feature_locked' }])
    expect(shop.submit(RACK_SLOT)).toMatchObject([{ reason: 'feature_locked' }])
  })

  it('fills the rack with 3 charges on planet 7, bolting it on, at 2 band-5 units each', () => {
    const shop = shopOn(7)
    expect(shop.submit(restock(1, 3))).toEqual([
      expect.objectContaining({
        type: 'ChargesRestocked',
        size: 1,
        count: 3,
        price: toCanonical(chargePrice(1, 3, 7)),
      }),
    ])
    expect(shop.charges()).toEqual({
      isRackMounted: true,
      slotLevel: 0,
      carriedBySize: { '1': 3 },
      planted: null,
    })
  })

  it('restocks at the Upgrade bay only, and never for less than the full price', () => {
    expect(shopOn(7, 'sell').submit(restock(1, 1))).toMatchObject([{ reason: 'wrong_bay' }])
    expect(shopOn(7, 'upgrade', '1').submit(restock(1, 1))).toMatchObject([
      { reason: 'money_short' },
    ])
  })

  it('adds one rack slot per buy up to 8, at its band-5 price, then refuses', () => {
    const shop = shopOn(7)
    expect(shop.submit(RACK_SLOT)).toEqual([
      expect.objectContaining({
        type: 'ChargeRackUpgraded',
        from: 0,
        to: 1,
        price: toCanonical(rackSlotPrice(0, 7)),
      }),
    ])
    for (let slot = 1; slot < 5; slot++) shop.submit(RACK_SLOT)
    expect(shop.charges()).toMatchObject({ isRackMounted: true, slotLevel: 5 })
    expect(shop.submit(RACK_SLOT)).toMatchObject([{ reason: 'max_level' }])
    expect(shop.submit(restock(1, 8))).toMatchObject([{ type: 'ChargesRestocked', count: 8 }])
  })

  it('refuses a debug rack that holds more charges than its slots', () => {
    const shop = shopOn(7)
    expect(shop.submit(setChargesIntent(4, 0))).toMatchObject([{ reason: 'out_of_range' }])
    expect(shop.submit(setChargesIntent(0, 6))).toMatchObject([{ reason: 'out_of_range' }])
    expect(shop.submit(setChargesIntent(2, 0, 4))).toMatchObject([{ reason: 'out_of_range' }])
  })
})

describe('charge sizes at the Upgrade bay (K8 #218)', () => {
  it('refuses charges that do not fit the free slots, never trimming the buy', () => {
    const shop = shopOn(7)
    shop.submit(setChargesIntent(1))
    expect(shop.submit(restock(1, 3))).toMatchObject([{ reason: 'rack_full' }])
    expect(shop.charges().carriedBySize).toEqual({ '1': 1 })
    expect(shop.submit(restock(1, 2))).toMatchObject([{ type: 'ChargesRestocked', count: 2 }])
    expect(shop.submit(restock(1, 1))).toMatchObject([{ reason: 'rack_full' }])
  })

  it('refuses a size before its planet: size 2 opens on planet 10', () => {
    expect(shopOn(9).submit(restock(2, 1))).toMatchObject([{ reason: 'size_locked' }])
    expect(shopOn(10).submit(restock(2, 1))).toMatchObject([
      { type: 'ChargesRestocked', size: 2, count: 1 },
    ])
  })

  it('fits a size-4 charge in two slots beside a size-1 charge in the third', () => {
    const shop = shopOn(16)
    expect(shop.submit(restock(4, 2))).toMatchObject([{ reason: 'rack_full' }])
    shop.submit(restock(4, 1))
    expect(shop.submit(restock(1, 1))).toMatchObject([{ type: 'ChargesRestocked', size: 1 }])
    expect(shop.submit(restock(1, 1))).toMatchObject([{ reason: 'rack_full' }])
    expect(shop.charges().carriedBySize).toEqual({ '1': 1, '4': 1 })
  })

  it('fills a full rack of 8 slots with one size-10 charge on planet 34', () => {
    const shop = shopOn(34)
    for (let slot = 0; slot < 5; slot++) shop.submit(RACK_SLOT)
    expect(shop.submit(restock(10, 1))).toMatchObject([
      { type: 'ChargesRestocked', size: 10, count: 1, price: toCanonical(chargePrice(10, 1, 34)) },
    ])
    expect(shop.submit(restock(1, 1))).toMatchObject([{ reason: 'rack_full' }])
  })

  it('refuses a size off the ladder and a buy of no charges', () => {
    const shop = shopOn(40)
    expect(shop.submit(restock(11, 1))).toMatchObject([{ reason: 'out_of_range' }])
    expect(shop.submit(restock(0, 1))).toMatchObject([{ reason: 'out_of_range' }])
    expect(shop.submit(restock(1, 0))).toMatchObject([{ reason: 'out_of_range' }])
  })
})
