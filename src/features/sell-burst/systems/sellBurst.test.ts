import { describe, expect, it } from 'vitest'
import { add, fromCanonical, sub, toCanonical, type Money } from '../../../systems/money'
import { BURST_TIMING, firstCoinLandTick } from './burstTiming'
import { landingCoinsOf, type BurstSale } from './burstWave'
import { landedCoinsAt, rolledTotalOf, shownMoneyOf } from './counterRoll'
import { liningBilledOf, liningTagPhaseAt } from './liningTag'
import {
  burstEndTickOf,
  burstWithSale,
  flareStartTickOf,
  isBurstOverAt,
  type SellBurst,
} from './sellBurst'

const { coins, lining, flare, mergeWindowTicks } = BURST_TIMING

function saleOf(
  credits: string,
  liningPaid: string,
  overrides: Partial<BurstSale> = {},
): BurstSale {
  return {
    items: [{ tier: 1, amount: 4 }],
    credits: fromCanonical(credits),
    coinsShown: 12,
    liningPaid: fromCanonical(liningPaid),
    nextStepPrice: fromCanonical('100'),
    ...overrides,
  }
}

/** The wallet once the authority paid the sale: before + credits − X. */
function walletAfter(before: string | Money, sale: BurstSale): Money {
  const start = typeof before === 'string' ? fromCanonical(before) : before
  return sub(add(start, sale.credits), sale.liningPaid)
}

function burstOf(sale: BurstSale, tick = 100): SellBurst {
  return burstWithSale(null, sale, tick, false)
}

/** Every tick of the burst, from its sale to its end. */
function ticksOf(burst: SellBurst): number[] {
  const start = burst.waves[0].startTick
  return Array.from({ length: burstEndTickOf(burst) - start + 1 }, (_, index) => start + index)
}

describe('sell burst lining beat (G&V on #176)', () => {
  it('case 1: with no bill there is no tag and no peel, and every coin lands', () => {
    const sale = saleOf('400', '0')
    const burst = burstOf(sale)
    expect(burst.waves[0].peel).toBe(0)
    expect(ticksOf(burst).map((tick) => liningTagPhaseAt(burst, tick))).not.toContain('shown')
    expect(landedCoinsAt(burst, burstEndTickOf(burst))).toBe(12)
    expect(shownMoneyOf(walletAfter('50', sale), burst, burstEndTickOf(burst))).toEqual(
      walletAfter('50', sale),
    )
  })

  it('case 2: a bill under the proceeds peels at least one coin, the tag shows X and the counter ends on the wallet', () => {
    const sale = saleOf('400', '37.5')
    const burst = burstOf(sale)
    const [wave] = burst.waves
    const wallet = walletAfter('50', sale)
    expect(wave.peel).toBeGreaterThanOrEqual(1)
    expect(landingCoinsOf(wave) + wave.peel).toBe(sale.coinsShown)
    expect(liningBilledOf(burst)).toEqual(fromCanonical('37.5'))
    expect(liningTagPhaseAt(burst, 100 + lining.liningPeelTick)).toBe('shown')
    expect(shownMoneyOf(wallet, burst, 100)).toEqual(fromCanonical('50'))
    expect(shownMoneyOf(wallet, burst, 100 + coins.landTick)).toEqual(wallet)
  })

  it('case 3: a bill bigger than the proceeds peels every coin and the counter never moves', () => {
    // The authority stops X at the proceeds; the rest stays on the vehicle as debt to the dock.
    const sale = saleOf('400', '400')
    const burst = burstOf(sale)
    const wallet = walletAfter('50', sale)
    expect(burst.waves[0].peel).toBe(sale.coinsShown)
    expect(landingCoinsOf(burst.waves[0])).toBe(0)
    const shown = ticksOf(burst).map((tick) => toCanonical(shownMoneyOf(wallet, burst, tick)))
    expect(new Set(shown)).toEqual(new Set([toCanonical(wallet)]))
    expect(liningTagPhaseAt(burst, 100 + lining.liningPeelTick)).toBe('shown')
  })

  it('case 4: credits of ten steps whose net falls short after the bill light no flare', () => {
    const burst = burstOf(saleOf('1000', '0.001'))
    expect(flareStartTickOf(burst)).toBeNull()
    expect(flareStartTickOf(burstOf(saleOf('1000', '0')))).toBe(100 + coins.landTick)
  })

  it('keeps the whole burst, flare included, inside 90 ticks to the counter plus 18', () => {
    const burst = burstOf(saleOf('1000', '0'))
    expect(burstEndTickOf(burst) - 100).toBe(coins.landTick + flare.ticks)
  })

  it('holds the tag 96 ticks after the last peeled coin lands, then fades it over 12', () => {
    const burst = burstOf(saleOf('400', '100'))
    const fade = 100 + lining.liningPeelTick + coins.flightTicks + lining.liningTagHoldTicks
    expect(liningTagPhaseAt(burst, fade - 1)).toBe('shown')
    expect(liningTagPhaseAt(burst, fade)).toBe('fading')
    expect(liningTagPhaseAt(burst, fade + lining.liningTagFadeTicks)).toBe('hidden')
    expect(isBurstOverAt(burst, fade + lining.liningTagFadeTicks)).toBe(true)
  })
})

describe('sell burst merging (#171 section 3)', () => {
  it('merges a second sale within 1.5 s into the running burst as a new wave', () => {
    const first = burstOf(saleOf('400', '10'))
    const merged = burstWithSale(first, saleOf('200', '5'), 100 + mergeWindowTicks, false)
    expect(merged.waves).toHaveLength(2)
    expect(liningBilledOf(merged)).toEqual(fromCanonical('15'))
  })

  it('starts a fresh burst for a sale after the merge window', () => {
    const first = burstOf(saleOf('400', '10'))
    const fresh = burstWithSale(first, saleOf('200', '5'), 101 + mergeWindowTicks, false)
    expect(fresh.waves).toHaveLength(1)
    expect(liningBilledOf(fresh)).toEqual(fromCanonical('5'))
  })

  it('adds coins only up to the cap of 40', () => {
    const big = { coinsShown: 30 }
    const first = burstOf(saleOf('400', '0', big))
    const merged = burstWithSale(first, saleOf('400', '0', big), 110, false)
    expect(merged.waves.map((wave) => wave.coins)).toEqual([30, 10])
  })

  it('extends the timeline to the last wave', () => {
    const first = burstOf(saleOf('400', '0'))
    const merged = burstWithSale(first, saleOf('400', '0'), 130, false)
    expect(isBurstOverAt(merged, 100 + coins.landTick)).toBe(false)
    expect(isBurstOverAt(merged, 130 + coins.landTick)).toBe(true)
  })
})

describe('sell burst counter roll', () => {
  it('rolls up as the coins land and never past the wallet', () => {
    const sale = saleOf('400', '0')
    const burst = burstOf(sale)
    const wallet = walletAfter('50', sale)
    const firstLand = 100 + firstCoinLandTick()
    expect(shownMoneyOf(wallet, burst, firstLand - 1)).toEqual(fromCanonical('50'))
    const halfway = shownMoneyOf(wallet, burst, firstLand + 9)
    expect(sub(halfway, fromCanonical('50'))).not.toEqual(fromCanonical('0'))
    expect(sub(wallet, halfway)).not.toEqual(fromCanonical('0'))
  })

  it('rolls through exactly the merged credits less the bills and ends on the wallet at L 6007 magnitudes', () => {
    const before = '7.123456789012345678901234567890123456789e+2900'
    const first = saleOf('1.234567890123456789012345678901234567891e+2899', '2.5e+2890')
    const second = saleOf('9.876543210987654321098765432109876543219e+2898', '0')
    const wallet = walletAfter(walletAfter(before, first), second)
    const merged = burstWithSale(burstOf(first), second, 140, false)
    const credits = add(first.credits, second.credits)
    expect(rolledTotalOf(merged)).toEqual(sub(credits, first.liningPaid))
    expect(shownMoneyOf(wallet, merged, burstEndTickOf(merged))).toEqual(wallet)
    expect(shownMoneyOf(wallet, merged, 100)).toEqual(sub(wallet, rolledTotalOf(merged)))
  })
})
