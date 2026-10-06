import { describe, expect, it } from 'vitest'
import { rackSlotPrice, restockPrice } from '../../economy/blastingCharges'
import { toCanonical } from '../../money'
import { createAuthorityState } from '../authorityState'
import { applyCommand, type CommandOutcome } from '../applyCommand'
import type { CommandIntent } from '../authorityCommand'
import { WORLD_SEED } from '../scriptedSession'
import { setChargesIntent } from './chargeFixtures'

const RESTOCK: CommandIntent<'restockCharges'> = { type: 'restockCharges', payload: {} }
const RACK_SLOT: CommandIntent<'buyChargeRackSlot'> = { type: 'buyChargeRackSlot', payload: {} }

/** A session on `planetIndex` with money, docked at one bay, answering each intent's events. */
function shopOn(planetIndex: number, bay: 'sell' | 'upgrade' = 'upgrade', money = '1e12') {
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
    expect(shop.submit(RESTOCK)).toMatchObject([{ reason: 'feature_locked' }])
    expect(shop.submit(RACK_SLOT)).toMatchObject([{ reason: 'feature_locked' }])
  })

  it('fills the rack with 3 charges on planet 7, bolting it on, at 2 band-5 units each', () => {
    const shop = shopOn(7)
    expect(shop.submit(RESTOCK)).toEqual([
      expect.objectContaining({
        type: 'ChargesRestocked',
        count: 3,
        price: toCanonical(restockPrice(3, 7)),
      }),
    ])
    expect(shop.charges()).toEqual({ isRackMounted: true, slotLevel: 0, carried: 3, planted: null })
  })

  it('refills only the empty slots, and refuses a full rack', () => {
    const shop = shopOn(7)
    shop.submit(setChargesIntent(1))
    expect(shop.submit(RESTOCK)).toMatchObject([{ type: 'ChargesRestocked', count: 2 }])
    expect(shop.submit(RESTOCK)).toMatchObject([{ reason: 'rack_full' }])
  })

  it('restocks at the Upgrade bay only, and never for less than the full price', () => {
    expect(shopOn(7, 'sell').submit(RESTOCK)).toMatchObject([{ reason: 'wrong_bay' }])
    expect(shopOn(7, 'upgrade', '1').submit(RESTOCK)).toMatchObject([{ reason: 'money_short' }])
  })

  it('adds one rack slot per buy up to 8 charges, at its band-5 price, then refuses', () => {
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
    expect(shop.submit(RESTOCK)).toMatchObject([{ type: 'ChargesRestocked', count: 8 }])
  })

  it('refuses a debug rack that holds more charges than its slots', () => {
    const shop = shopOn(7)
    expect(shop.submit(setChargesIntent(4, 0))).toMatchObject([{ reason: 'out_of_range' }])
    expect(shop.submit(setChargesIntent(0, 6))).toMatchObject([{ reason: 'out_of_range' }])
  })
})
