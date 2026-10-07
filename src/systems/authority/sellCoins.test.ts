import { describe, expect, it } from 'vitest'
import { upgradePrice } from '../economy/upgradePrices'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { cmp, fromCanonical, mul, type Money } from '../money'
import { coinsShownOf, nextStepPriceOf } from './sellCoins'
import { createScriptedSession } from './scriptedSession'

const money = (text: string) => fromCanonical(text)

/** #171's float formula, the reference the exact compare must agree with away from a boundary. */
function floatCoinsOf(ratio: number): number {
  return Math.min(40, Math.max(3, Math.round(4 * Math.log2(1 + ratio))))
}

describe('sell burst coins', () => {
  it('shows the fewest 3 coins for a sale worth nothing next to the step', () => {
    expect(coinsShownOf(money('0'), money('100'))).toBe(3)
    expect(coinsShownOf(money('1'), money('100'))).toBe(3)
  })

  it('shows 4 coins for a sale that pays for exactly one step', () => {
    expect(coinsShownOf(money('100'), money('100'))).toBe(4)
  })

  it('caps at 40 coins from a sale of 1023 steps up', () => {
    expect(coinsShownOf(money('102300'), money('100'))).toBe(40)
    expect(coinsShownOf(money('1e300'), money('100'))).toBe(40)
  })

  it('crosses from 4 to 5 coins exactly where 4·log2 reaches 4.5, at 2^(9/8) - 1 steps', () => {
    // 2^(9/8) = 2.18101536...
    expect(coinsShownOf(money('1.18101'), money('1'))).toBe(4)
    expect(coinsShownOf(money('1.18102'), money('1'))).toBe(5)
  })

  it("agrees with the float formula on ratios away from a count's boundary", () => {
    const ratios = [0.2, 0.5, 0.8, 1.5, 3, 7, 12.5, 30, 64, 100, 250, 500, 900, 2000]
    for (const ratio of ratios) {
      expect(coinsShownOf(money(String(ratio * 1000)), money('1000'))).toBe(floatCoinsOf(ratio))
    }
  })

  it('reads the same at any money scale, P1 or past 1e40', () => {
    const counts = ['1e1', '1e20', '1e45'].map((price) =>
      coinsShownOf(mul(money(price), money('7')), money(price)),
    )
    expect(counts).toEqual([12, 12, 12])
  })
})

describe('sell burst step price', () => {
  it('is the cheapest next whole level among the six Workshop tracks', () => {
    const session = createScriptedSession()
    const prices = UPGRADE_IDS.map((id) => upgradePrice(id, 0, 1))
    const cheapest = prices.reduce((a: Money, b: Money) => (cmp(b, a) < 0 ? b : a))
    expect(cmp(nextStepPriceOf(session.state(), 'p1'), cheapest)).toBe(0)
  })

  it('follows the levels the player has bought', () => {
    const session = createScriptedSession()
    const before = nextStepPriceOf(session.state(), 'p1')
    for (const upgradeId of UPGRADE_IDS) {
      session.submit(1, { type: 'debug.setUpgrade', payload: { upgradeId, level: 5 } })
    }
    expect(cmp(nextStepPriceOf(session.state(), 'p1'), before)).toBe(1)
  })
})
