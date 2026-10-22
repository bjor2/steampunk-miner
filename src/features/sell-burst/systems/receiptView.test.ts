import { describe, expect, it } from 'vitest'
import {
  add,
  fromCanonical,
  fromSafeInteger,
  mul,
  ZERO_MONEY,
  type Money,
} from '../../../systems/money'
import type { SeenRarity } from '../../../systems/render/seenRarity'
import type { HeldKind } from './heldManifest'
import { RECEIPT } from './receiptData'
import { receiptViewOf, type ReceiptReading } from './receiptView'
import { receiptWithSale, type TripReceipt } from './tripReceipt'

const RARE: SeenRarity = { lead: 2, rarity: 'rare', tint: [0.2, 0.4, 1], pulse: 0 }
/** The formatter's widest text (#681): 6 characters at most, past 1e300 too. */
const WIDEST = 6

function kind(tier: number, key: string, count: number, rarity: SeenRarity | null): HeldKind {
  return { tier, key, name: key === 'unnamed' ? null : key, rarity, count }
}

function receiptOf(sold: readonly HeldKind[], unitPrice: string, liningPaid = '0'): TripReceipt {
  const price = fromCanonical(unitPrice)
  const credits = sold.reduce(
    (total, held) => add(total, mul(price, fromSafeInteger(held.count))),
    ZERO_MONEY,
  )
  return receiptWithSale(
    null,
    { sold, credits, liningPaid: fromCanonical(liningPaid), tick: 1 },
    () => price,
  )
}

function readingOf(receipt: TripReceipt, lastTripNet: Money | null = null): ReceiptReading {
  return { receipt, rollStep: RECEIPT.roll.steps, lastTripNet, isMotionReduced: false }
}

describe('sell receipt view', () => {
  it('heads each rarity group by its word and the unseen one by the data word', () => {
    const view = receiptViewOf(
      readingOf(
        receiptOf([kind(5, 'Gilded Brassvein', 2, RARE), kind(4, 'unnamed', 3, null)], '10'),
      ),
    )
    expect(view.groups.map((group) => group.heading)).toEqual(['Rare', RECEIPT.copy.unseenRarity])
    expect(view.groups[0].rarity?.tint).not.toBeNull()
    expect(view.groups[1].rarity).toBeNull()
  })

  it("names an unnamed kind by its tier and shows each line's count and coin", () => {
    const view = receiptViewOf(readingOf(receiptOf([kind(4, 'unnamed', 3, null)], '12.5')))
    expect(view.groups[0].lines).toEqual([
      {
        key: '4:unnamed',
        name: 'Tier 4 ore',
        count: '×3',
        coin: { text: '37.5', exact: '3.75e+1' },
      },
    ])
  })

  it('rounds a gain down and the lining bill up, with its exact value beside it', () => {
    const view = receiptViewOf(readingOf(receiptOf([kind(4, 'a', 1, null)], '12345', '1234.5')))
    expect(view.groups[0].lines[0].coin.text).toBe('12.3k')
    expect(view.lining).toEqual({
      label: RECEIPT.copy.lining,
      paid: { text: '−1,235', exact: '1.2345e+3' },
    })
  })

  it('leaves the lining line out when no sale paid a bill', () => {
    expect(receiptViewOf(readingOf(receiptOf([kind(4, 'a', 1, null)], '10'))).lining).toBeNull()
  })

  it('says first trip with no figure, then the last trip with its compare glyph', () => {
    const receipt = receiptOf([kind(4, 'a', 1, null)], '10')
    expect(receiptViewOf(readingOf(receipt)).lastTrip).toEqual({
      label: RECEIPT.copy.firstTrip,
      total: null,
      compare: null,
      glyph: '',
    })
    const lower = receiptViewOf(readingOf(receipt, fromCanonical('9'))).lastTrip
    expect(lower).toMatchObject({ label: RECEIPT.copy.lastTrip, compare: 'up', glyph: '▲' })
    expect(lower.total?.text).toBe('9')
  })

  it('keeps every figure to the formatter width at P41+ amounts and past 1e300', () => {
    for (const price of ['4.56e+17', '9.99e+299', '1.2345e+305']) {
      const view = receiptViewOf(
        readingOf(receiptOf([kind(140, 'a', 999, RARE)], price, '1e+3'), fromCanonical(price)),
      )
      const figures = [
        view.groups[0].lines[0].coin.text,
        view.total.shown.text,
        view.lastTrip.total?.text ?? '',
      ]
      expect(figures.every((text) => text.length <= WIDEST)).toBe(true)
    }
  })

  it('shows the rolling total at its step and says it is rolling', () => {
    const receipt = receiptOf([kind(4, 'a', 4, null)], '10')
    const view = receiptViewOf({ ...readingOf(receipt), rollStep: 0 })
    expect(view.isRolling).toBe(true)
    expect(view.total.shown.exact).toBe('0e+0')
    expect(view.total.net.exact).toBe('4e+1')
  })
})
