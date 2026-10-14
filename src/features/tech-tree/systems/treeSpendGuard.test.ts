import { describe, expect, it } from 'vitest'
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { fromCanonical } from '../../../systems/money'
import { TREE_ECONOMY } from './treeEconomy'
import {
  missedPlanetsOf,
  treeShareTableOf,
  treeShareVerdictsOf,
  treeSpendRowsOf,
} from './treeSpendGuard'

function spend(planetIndex: number, source: ShopSpend['source'], purchaseId: string, cost: string) {
  return { planetIndex, source, purchaseId, cost: fromCanonical(cost) }
}

/** A planet where the tree took `treeCost` of 1,000 spent: research and an item, the rest brass. */
function planetSpends(planetIndex: number, treeCost: number): ShopSpend[] {
  const research = treeCost / 2
  return [
    spend(planetIndex, 'slice', 'tech-tree.research', String(research)),
    spend(planetIndex, 'slice', 'tech-tree.buy-item', String(treeCost - research)),
    spend(planetIndex, 'kernel', 'buyUpgrade', String(1000 - treeCost)),
  ]
}

function shareTexts(spends: readonly ShopSpend[]) {
  return treeSpendRowsOf(spends).map((row) => [row.planetIndex, row.treeShare.toString()])
}

describe('tech tree: spend guard', () => {
  it('counts node research and tree item buys against everything bought on the planet', () => {
    expect(shareTexts(planetSpends(4, 200))).toEqual([[4, '0.2']])
  })

  it('counts a restock and other slice buys in the denominator only', () => {
    const spends = [
      spend(5, 'slice', 'tech-tree.research', '100'),
      spend(5, 'kernel', 'restockCharges', '300'),
      spend(5, 'slice', 'other-slice.restock', '100'),
      spend(5, 'kernel', 'buyUpgrade', '500'),
    ]
    expect(shareTexts(spends)).toEqual([[5, '0.1']])
  })

  it('judges each planet on the median of the seeds', () => {
    const seeds = [planetSpends(3, 50), planetSpends(3, 350), planetSpends(3, 200)]
    const [verdict] = treeShareVerdictsOf(seeds)
    expect(verdict.medianShare).toEqual(fromCanonical('0.2'))
    expect(verdict.isOutsideBand).toBe(false)
  })

  it('takes the mean of the two middle seeds when only two bought on the planet', () => {
    const seeds = [planetSpends(6, 100), planetSpends(6, 400), []]
    const [verdict] = treeShareVerdictsOf(seeds)
    expect(verdict.seedShares).toHaveLength(2)
    expect(verdict.medianShare).toEqual(fromCanonical('0.25'))
  })

  it('holds P2 to P20 to 10-30% and P21 on to 10-25%, endless included', () => {
    const run = [
      ...planetSpends(2, 300),
      ...planetSpends(20, 310),
      ...planetSpends(21, 260),
      ...planetSpends(45, 250),
      ...planetSpends(60, 90),
    ]
    const missed = missedPlanetsOf(treeShareVerdictsOf([run, run, run]))
    expect(missed.map((verdict) => verdict.planetIndex)).toEqual([20, 21, 60])
  })

  it('never judges planet 1', () => {
    const [verdict] = treeShareVerdictsOf([planetSpends(1, 900)])
    expect(verdict.band).toBeNull()
    expect(verdict.isOutsideBand).toBe(false)
  })

  it('reads its bands from the tree economy, the second from planet 21', () => {
    expect(TREE_ECONOMY.spendGuard.map((band) => band.fromPlanet)).toEqual([2, 21])
  })

  it('prints each seed, the median and the band, and marks a miss', () => {
    const seeds = [planetSpends(21, 300), planetSpends(21, 280), planetSpends(21, 320)]
    expect(treeShareTableOf(treeShareVerdictsOf(seeds))).toContain(
      '| P21 | 30% / 28% / 32% | 30% | 10%–25% | outside the band |',
    )
  })
})
