import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore, useGameStore } from '../../../store/gameStore'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { toCanonical } from '../../../systems/money'
import { RECEIPT } from '../systems/receiptData'
import { isRollDone, rolledTotalAt } from '../systems/tripReceipt'
import { resetReceiptStore, useReceiptStore } from './receiptStore'

function localPlayer(): string {
  return useGameStore.getState().playerId
}

function soldAt(tick: number, value: string, playerId = localPlayer()): DomainEvent {
  return {
    type: 'ResourceSold',
    items: [{ tier: 1, amount: 4 }],
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

function leftDockAt(tick: number): DomainEvent {
  return {
    type: 'DockLeft',
    bay: 'sell',
    durationTicks: 10,
    tick,
    playerId: localPlayer(),
    seq: 1,
  }
}

function hear(...events: DomainEvent[]): void {
  useReceiptStore.getState().hearReceiptBatch(events, localPlayer())
}

/** The total the receipt shows now. */
function shownTotal(): string | null {
  const { receipt, rollStep } = useReceiptStore.getState()
  return receipt === null ? null : toCanonical(rolledTotalAt(receipt, rollStep))
}

beforeEach(() => {
  resetGameStore()
  resetReceiptStore()
})

describe('sell receipt store', () => {
  it('shows the receipt on a sale with its total at nothing, then rolls it up to the net', () => {
    hear(soldAt(100, '40'), settledAt(100, '4'))
    expect(useReceiptStore.getState().isShown).toBe(true)
    expect(shownTotal()).toBe('0e+0')
    for (let tick = 100; tick <= 100 + RECEIPT.roll.maxTicks; tick++) {
      useReceiptStore.getState().advanceReceiptTo(tick)
    }
    expect(shownTotal()).toBe('3.6e+1')
  })

  it('skips the roll on a tap and puts the receipt away on the next', () => {
    hear(soldAt(100, '40'))
    useReceiptStore.getState().tapReceipt()
    expect(isRollDone(useReceiptStore.getState().rollStep)).toBe(true)
    expect(shownTotal()).toBe('4e+1')
    expect(useReceiptStore.getState().isShown).toBe(true)
    useReceiptStore.getState().tapReceipt()
    expect(useReceiptStore.getState().isShown).toBe(false)
  })

  it('sets the total at once under Reduce Motion', () => {
    useGameStore.getState().setPreference('shake', false)
    hear(soldAt(100, '40'))
    expect(shownTotal()).toBe('4e+1')
  })

  it('puts the receipt away on leaving the dock', () => {
    hear(soldAt(100, '40'))
    hear(leftDockAt(130))
    expect(useReceiptStore.getState().isShown).toBe(false)
  })

  it("never shows a receipt for another player's sale", () => {
    hear(soldAt(100, '40', 'someone-else'))
    expect(useReceiptStore.getState().receipt).toBeNull()
    expect(useReceiptStore.getState().isShown).toBe(false)
  })

  it('drops the receipt when the clock goes back past its sale, as a restored session does', () => {
    hear(soldAt(100, '40'))
    useReceiptStore.getState().advanceReceiptTo(40)
    expect(useReceiptStore.getState().receipt).toBeNull()
  })

  it('takes the same steps at 30 and 144 frames a second', () => {
    const stepAfterHalfASecond = (framesPerSecond: number) => {
      resetReceiptStore()
      hear(soldAt(100, '40'))
      for (let frame = 0; frame * 2 <= framesPerSecond; frame++) {
        useReceiptStore
          .getState()
          .advanceReceiptTo(100 + Math.floor((frame * 60) / framesPerSecond))
      }
      return useReceiptStore.getState().rollStep
    }
    expect(stepAfterHalfASecond(30)).toBe(stepAfterHalfASecond(144))
  })
})
