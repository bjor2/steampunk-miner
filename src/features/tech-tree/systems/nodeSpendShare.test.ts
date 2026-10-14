import { describe, expect, it } from 'vitest'
import type { ShopSpend } from '../../../systems/bot/shopSpend'
import { fromCanonical, toCanonical } from '../../../systems/money'
import { ITEM_BOT_PURCHASE } from './itemShop'
import {
  laneShareRowsOf,
  laneShareTableOf,
  nodeSpendRowsOf,
  nodeSpendTableOf,
} from './nodeSpendShare'
import { RESEARCH_BOT_PURCHASE } from './researchBotPurchase'
import { TECH_LANES, type TechLane } from './techNode'
import { registeredTechTree } from './techTree'

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

function firstCapabilityOf(lane: TechLane) {
  const node = registeredTechTree().authored.find(
    (each) => each.lane === lane && each.kind === 'capability',
  )
  if (node === undefined) throw new Error(`no capability in lane ${lane}`)
  return node
}

/** The lane's first capability researched for `cost` on `planetIndex`. */
function laneResearch(planetIndex: number, lane: TechLane, cost: string): ShopSpend {
  const bought = spend(planetIndex, 'slice', RESEARCH_BOT_PURCHASE.id, cost)
  return { ...bought, boughtId: firstCapabilityOf(lane).id }
}

/** The item the lane's first capability unlocks, bought for `cost` on `planetIndex`. */
function laneItem(planetIndex: number, lane: TechLane, cost: string): ShopSpend {
  const bought = spend(planetIndex, 'slice', ITEM_BOT_PURCHASE.id, cost)
  return { ...bought, boughtId: firstCapabilityOf(lane).unlocks.itemId }
}

const SEED_A: ShopSpend[] = [
  spend(15, 'kernel', 'buyUpgrade', '800'),
  laneResearch(15, 'aetheric', '100'),
  laneItem(15, 'aetheric', '50'),
  laneResearch(15, 'sensing', '50'),
]
const SEED_B: ShopSpend[] = [
  spend(15, 'kernel', 'buyUpgrade', '900'),
  laneResearch(15, 'aetheric', '100'),
]
const SEED_C: ShopSpend[] = [
  spend(15, 'kernel', 'buyUpgrade', '700'),
  laneResearch(15, 'aetheric', '300'),
  spend(16, 'kernel', 'buyUpgrade', '100'),
]

function sharesOf(rows: ReturnType<typeof laneShareRowsOf>, planetIndex: number) {
  return rows
    .filter((row) => row.planetIndex === planetIndex)
    .map((row) => [row.lane, row.seedShares.map(toCanonical), toCanonical(row.medianShare)])
}

describe("tech tree: the six lanes' spend share rows", () => {
  it('prints six rows on every planet a seed bought on, a lane that took nothing at zero', () => {
    const rows = laneShareRowsOf([SEED_A, SEED_B, SEED_C])
    expect(rows.map((row) => [row.planetIndex, row.lane])).toEqual([
      ...TECH_LANES.map((lane) => [15, lane]),
      ...TECH_LANES.map((lane) => [16, lane]),
    ])
    expect(sharesOf(rows, 16).every(([, , median]) => median === '0e+0')).toBe(true)
  })

  it("takes the aetheric lane's nodes and items against the whole planet, on the seed median", () => {
    const aetheric = sharesOf(laneShareRowsOf([SEED_A, SEED_B, SEED_C]), 15).find(
      ([lane]) => lane === 'aetheric',
    )
    expect(aetheric).toEqual(['aetheric', ['1.5e-1', '1e-1', '3e-1'], '1.5e-1'])
  })

  it('counts each lane apart, so the five lanes keep their own share beside the sixth', () => {
    const sensing = sharesOf(laneShareRowsOf([SEED_A, SEED_B, SEED_C]), 15).find(
      ([lane]) => lane === 'sensing',
    )
    expect(sensing).toEqual(['sensing', ['5e-2', '0e+0', '0e+0'], '0e+0'])
  })

  it('prints the rows as a table, each seed beside the median', () => {
    expect(laneShareTableOf(laneShareRowsOf([SEED_A, SEED_B, SEED_C]))).toContain(
      '| P15 | aetheric | 15% / 10% / 30% | 15% |',
    )
  })
})
