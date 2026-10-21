import { describe, expect, it } from 'vitest'
import { moneyShortRejection } from '../authority/platformServices'
import { formatAmount, formatPrice } from '../displayAmount'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { stepPrice } from '../economy/upgradePrices'
import { onCurveSteps } from '../economy/vehicleStats'
import { fromCanonical, fromSafeInteger, mul, sub } from '../money'
import { planetParamsFor } from '../world/planetParams'
import { COMPACT_VALUE_CHARS_MAX } from './hudCompact'

// VS on #500: the compact HUD's boxes hold the widest number they can show, from the first planet
// to the far endless, with the same formatter as the full card; affordability reads exact values.

const PLANETS = [1, 40, 200, 10_000]
const FAT_WALLET = fromSafeInteger(1_000_000)
const SLOWEST_TILE_SECONDS = '99.99 s'

/** Every on-curve next step's price on the planet, and a wallet a million times the dearest. */
function widestAmountsOn(planet: number): string[] {
  const steps = onCurveSteps(planet)
  const prices = UPGRADE_IDS.map((id) => stepPrice(id, steps[id] + 1, planet))
  const wallets = prices.map((price) => mul(price, FAT_WALLET))
  return [...prices, ...wallets].map((amount) => formatAmount(amount))
}

describe('compact HUD numbers (#500, VS)', () => {
  it('fits the widest compact number in one box at P1, P40, P200 and a far-endless sample, for price, money, cells per second and depth', () => {
    for (const planet of PLANETS) {
      const depth = String(planetParamsFor(planet, 1).radiusTiles)
      const texts = [...widestAmountsOn(planet), depth, SLOWEST_TILE_SECONDS]
      const tooWide = texts.filter((text) => text.length > COMPACT_VALUE_CHARS_MAX)
      expect(tooWide, `P${planet}`).toEqual([])
    }
  })

  it('keeps the widest form the formatter prints within the box: a sign and a four-digit exponent', () => {
    expect(formatAmount(fromCanonical('-9.99999e+4000'))).toBe('-9e4000')
    expect('-9e4000'.length).toBeLessThanOrEqual(COMPACT_VALUE_CHARS_MAX)
  })

  it('never lets a rounded compact number read as affordable when the exact value is not', () => {
    const price = fromCanonical('1239999')
    const wallet = sub(price, fromCanonical('9999'))
    expect([formatAmount(wallet), formatPrice(price)]).toEqual(['1.23M', '1.24M'])
    expect(moneyShortRejection(wallet, price)?.reason).toBe('money_short')
    expect(moneyShortRejection(price, price)).toBeNull()
  })
})
