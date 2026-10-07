import { describe, expect, it } from 'vitest'
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { fromCanonical } from '../../../systems/money'
import { nodeSpendRowsOf, nodeSpendTableOf } from './nodeSpendShare'

function spend(planetIndex: number, source: ShopSpend['source'], purchaseId: string, cost: string) {
  return { planetIndex, source, purchaseId, cost: fromCanonical(cost) }
}

const SPENDS: ShopSpend[] = [
  spend(3, 'kernel', 'buyUpgrade', '900'),
  spend(3, 'slice', 'tech-tree.research', '100'),
  spend(4, 'kernel', 'buyUpgrade', '700'),
  spend(4, 'slice', 'tech-tree.research', '200'),
  spend(4, 'slice', 'other-slice.badge', '100'),
  spend(25, 'slice', 'tech-tree.research', '500'),
  spend(25, 'kernel', 'buyUpgrade', '500'),
]

describe('tech tree: nodes-only spend share', () => {
  it('counts only node research against everything bought on the planet', () => {
    const rows = nodeSpendRowsOf(SPENDS)
    expect(rows.map((row) => [row.planetIndex, row.nodeShare.toString()])).toEqual([
      [3, '0.1'],
      [4, '0.2'],
      [25, '0.5'],
    ])
  })

  it('flags a planet from 2 to 20 above the watched share, and never one past 20', () => {
    const rows = nodeSpendRowsOf(SPENDS)
    expect(rows.map((row) => row.isOverWatch)).toEqual([false, true, false])
  })

  it('prints the rows as a table in whole percent', () => {
    expect(nodeSpendTableOf(nodeSpendRowsOf(SPENDS))).toContain(
      '| P4 | 200 | 1,000 | 20% | above the watch |',
    )
  })
})
