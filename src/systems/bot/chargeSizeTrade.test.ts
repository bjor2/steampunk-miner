import { describe, expect, it } from 'vitest'
import { chargePrice, chargeSizeCount } from '../economy/chargeSizes'
import { div, fromSafeInteger, sub, toCanonical, ZERO_MONEY } from '../money'
import { planetParamsFor } from '../world/planetParams'
import {
  chargeSizeTradeOf,
  chargeSizeTradesOf,
  GUARD_DRILL_TICKS_PER_TILE,
  isBlastAboveDrill,
} from './chargeSizeTrade'

const WORLD_SEED = 83921
const TRADES = chargeSizeTradesOf(WORLD_SEED)

describe('charge size guard (#143 guard 1, #153, K8 #218)', () => {
  it('judges every size on its unlock planet and planet 40, in every band, at 24 and 45 ticks a tile', () => {
    expect(TRADES).toHaveLength(chargeSizeCount() * 2 * 5 * GUARD_DRILL_TICKS_PER_TILE.length)
    expect(new Set(TRADES.filter((trade) => trade.size === 10).map((t) => t.planetIndex))).toEqual(
      new Set([34, 40]),
    )
  })

  it('never earns more a tick blasting than drilling at the band ore density, for any size', () => {
    expect(TRADES.filter(isBlastAboveDrill)).toEqual([])
  })

  it('charges the blast its size price, so a blast in empty rock loses exactly that', () => {
    const params = { ...planetParamsFor(WORLD_SEED, 16), oreDensityBp: [0, 0, 0, 0, 0] }
    const trade = chargeSizeTradeOf(params, 4, 3, 24)
    const loss = div(sub(ZERO_MONEY, chargePrice(4, 1, 16)), fromSafeInteger(trade.cycleTicks))
    expect(toCanonical(trade.blastMoneyPerTick)).toBe(toCanonical(loss))
  })

  it('waits out a size fuse and backs a remote charge off past the interlock', () => {
    const params = planetParamsFor(WORLD_SEED, 25)
    const fused = chargeSizeTradeOf(params, 6, 3, 24)
    const remote = chargeSizeTradeOf(params, 7, 3, 24)
    expect(fused.cycleTicks).toBeGreaterThan(210)
    expect(remote.cycleTicks).toBeLessThan(fused.cycleTicks)
  })
})
