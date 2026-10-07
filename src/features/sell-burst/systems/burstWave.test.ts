import { describe, expect, it } from 'vitest'
import { fromCanonical } from '../../../systems/money'
import { BURST_TIMING } from './burstTiming'
import { chunksOfSale, freshRoom, landingCoinsOf, waveOfSale, type BurstSale } from './burstWave'

const FULL_ROOM = freshRoom(false)

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

describe('sell burst wave', () => {
  it('shows every logged coin on the counter when no bill was paid', () => {
    const wave = waveOfSale(saleOf('400', '0'), 0, FULL_ROOM)
    expect(wave.coins).toBe(12)
    expect(wave.peel).toBe(0)
  })

  it('peels round(coins · X / credits) coins for a bill, and they add up to the coins shown', () => {
    const wave = waveOfSale(saleOf('400', '100'), 0, FULL_ROOM)
    expect(wave.peel).toBe(3)
    expect(landingCoinsOf(wave) + wave.peel).toBe(12)
  })

  it('peels at least one coin for a bill too small to round to one', () => {
    expect(waveOfSale(saleOf('400', '0.001'), 0, FULL_ROOM).peel).toBe(1)
  })

  it('peels every coin when the bill took the whole proceeds', () => {
    const wave = waveOfSale(saleOf('400', '400'), 0, FULL_ROOM)
    expect(wave.peel).toBe(12)
    expect(landingCoinsOf(wave)).toBe(0)
  })

  it('lights the flare when the net reaches ten steps', () => {
    expect(waveOfSale(saleOf('1000', '0'), 0, FULL_ROOM).isFlare).toBe(true)
    expect(waveOfSale(saleOf('999.999', '0'), 0, FULL_ROOM).isFlare).toBe(false)
  })

  it('keeps the flare dark when the gross reaches ten steps but the net after the bill does not', () => {
    expect(waveOfSale(saleOf('1200', '200.001'), 0, FULL_ROOM).isFlare).toBe(false)
    expect(waveOfSale(saleOf('1200', '200'), 0, FULL_ROOM).isFlare).toBe(true)
  })

  it('compares the flare in Money at L 6007 magnitudes', () => {
    const step = fromCanonical('3.1415926535897932384626433832795028841e+2900')
    const sale = saleOf('3.1415926535897932384626433832795028841e+2901', '0', {
      nextStepPrice: step,
    })
    expect(waveOfSale(sale, 0, FULL_ROOM).isFlare).toBe(true)
    const short = { ...sale, liningPaid: fromCanonical('1e+2863') }
    expect(waveOfSale(short, 0, FULL_ROOM).isFlare).toBe(false)
  })

  it('halves the coins and the caps under reduced effects', () => {
    const reduced = freshRoom(true)
    expect(reduced).toEqual({ chunks: 12, coins: 20, isReduced: true })
    expect(waveOfSale(saleOf('400', '0', { coinsShown: 40 }), 0, reduced).coins).toBe(20)
    expect(waveOfSale(saleOf('400', '0', { coinsShown: 3 }), 0, reduced).coins).toBe(2)
  })

  it('cuts the coins to the room the running burst has left', () => {
    const room = { ...FULL_ROOM, coins: 5 }
    expect(waveOfSale(saleOf('400', '0'), 0, room).coins).toBe(5)
  })
})

describe('sell burst chunks', () => {
  it('throws one chunk per unit sold, in the tier of its ore', () => {
    const chunks = chunksOfSale(
      [
        { tier: 1, amount: 2 },
        { tier: 4, amount: 1 },
      ],
      BURST_TIMING.chunks.max,
    )
    expect(chunks).toEqual([
      { tier: 1, size: 1 },
      { tier: 1, size: 1 },
      { tier: 4, size: 1 },
    ])
  })

  it('collapses a haul of 24 units or more into 24 chunks of mixed sizes, shared by amount', () => {
    const chunks = chunksOfSale(
      [
        { tier: 1, amount: 30 },
        { tier: 4, amount: 90 },
      ],
      24,
    )
    expect(chunks).toHaveLength(24)
    expect(chunks.filter((chunk) => chunk.tier === 1)).toHaveLength(6)
    expect(new Set(chunks.map((chunk) => chunk.size))).toEqual(new Set([2, 3]))
  })

  it('throws no chunk once the burst has no room left', () => {
    expect(chunksOfSale([{ tier: 1, amount: 3 }], 0)).toEqual([])
  })

  it('reads a sale of no units as no chunks', () => {
    expect(chunksOfSale([], 24)).toEqual([])
  })
})
