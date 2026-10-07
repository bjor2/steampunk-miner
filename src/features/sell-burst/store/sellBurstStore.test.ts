import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { fromCanonical, sub } from '../../../systems/money'
import { BURST_TIMING } from '../systems/burstTiming'
import { shownMoneyOf } from '../systems/counterRoll'
import { liningBilledOf } from '../systems/liningTag'
import { resetSellBurstStore, useSellBurstStore } from './sellBurstStore'

const WALLET = fromCanonical('1000')

function soldAt(tick: number, value: string, playerId = localPlayer()): DomainEvent {
  return {
    type: 'ResourceSold',
    items: [{ tier: 1, amount: 5 }],
    value,
    mode: 'all',
    coinsShown: 10,
    tick,
    playerId,
    seq: 1,
  }
}

function settledAt(tick: number, paid: string): DomainEvent {
  return {
    type: 'LiningSettled',
    billed: paid,
    paid,
    forgiven: '0e+0',
    tick,
    playerId: localPlayer(),
    seq: 1,
  }
}

function localPlayer(): string {
  return useGameStore.getState().playerId
}

/** What the bay header shows now, for a wallet the sale already paid. */
function counterNow() {
  const { burst, shownTick } = useSellBurstStore.getState()
  return shownMoneyOf(WALLET, burst, shownTick)
}

beforeEach(() => {
  resetGameStore()
  resetSellBurstStore()
})

describe('sell burst store', () => {
  it("shows the wallet before the sale until the sale's first coin lands", () => {
    useSellBurstStore
      .getState()
      .hearSales([soldAt(100, '400'), settledAt(100, '40')], localPlayer())
    expect(counterNow()).toEqual(sub(WALLET, fromCanonical('360')))
    useSellBurstStore.getState().advanceSellBurstTo(100 + BURST_TIMING.coins.hangTick)
    expect(counterNow()).toEqual(sub(WALLET, fromCanonical('360')))
  })

  it('rolls the counter onto the wallet as the frames reach the land tick, then ends the burst', () => {
    useSellBurstStore.getState().hearSales([soldAt(100, '400')], localPlayer())
    for (let tick = 100; tick <= 100 + BURST_TIMING.coins.landTick; tick++) {
      useSellBurstStore.getState().advanceSellBurstTo(tick)
    }
    expect(counterNow()).toEqual(WALLET)
    const end = useSellBurstStore.getState().burst?.endTick ?? 0
    useSellBurstStore.getState().advanceSellBurstTo(end)
    expect(useSellBurstStore.getState().burst).toBeNull()
  })

  it('lands the same coins at 30 and 144 frames a second', () => {
    const landedAt = (framesPerSecond: number) => {
      resetSellBurstStore()
      useSellBurstStore.getState().hearSales([soldAt(100, '400')], localPlayer())
      for (let frame = 0; frame * 60 < 70 * framesPerSecond; frame++) {
        useSellBurstStore
          .getState()
          .advanceSellBurstTo(100 + Math.floor((frame * 60) / framesPerSecond))
      }
      return useSellBurstStore.getState().rollMark
    }
    expect(landedAt(30)).toBe(landedAt(144))
  })

  it('merges a second sale within 1.5 s and sums its bill into the one tag', () => {
    useSellBurstStore
      .getState()
      .hearSales([soldAt(100, '400'), settledAt(100, '40')], localPlayer())
    useSellBurstStore.getState().hearSales([soldAt(150, '200'), settledAt(150, '2')], localPlayer())
    const burst = useSellBurstStore.getState().burst
    expect(burst?.waves).toHaveLength(2)
    expect(burst === null ? null : liningBilledOf(burst)).toEqual(fromCanonical('42'))
  })

  it("never starts a burst for another player's sale", () => {
    useSellBurstStore.getState().hearSales([soldAt(100, '400', 'someone-else')], localPlayer())
    expect(useSellBurstStore.getState().burst).toBeNull()
  })

  it('halves the coins with flashes off, the reduced effects', () => {
    useGameStore.getState().setPreference('flashes', false)
    useSellBurstStore.getState().hearSales([soldAt(100, '400')], localPlayer())
    expect(useSellBurstStore.getState().burst?.waves[0].coins).toBe(5)
  })

  it('drops the burst when the clock goes back past its sale, as a restored session does', () => {
    useSellBurstStore.getState().hearSales([soldAt(100, '400')], localPlayer())
    useSellBurstStore.getState().advanceSellBurstTo(40)
    expect(useSellBurstStore.getState().burst).toBeNull()
    expect(counterNow()).toEqual(WALLET)
  })
})
