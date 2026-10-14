import { describe, expect, it } from 'vitest'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { forkPairOf, forkTreeNodesOf, type ForkBranchSpec } from './forkNode'
import { lastMarkOf } from './markLadder'
import { markBearerOf, markNodeOf } from './markNodes'
import { nodeCost, nodeOreCostOf } from './nodeCost'
import { TECH_LANES, type MarkLadder, type TreeNode } from './techNode'

// Two ladders of different lengths, so the walk covers every Mark step the shorter one has.
const LONG_LADDER: MarkLadder = { isIncomeItem: false, cooldown: 300, magnitude: { base: 600 } }
const SHORT_LADDER: MarkLadder = { isIncomeItem: true, cooldown: 600, charges: 2 }

const PLANETS = Array.from({ length: 45 }, (_, index) => index + 16)
const DEPTHS = [0, 3, 7]

function branchSpecOf(branch: string, marks: MarkLadder): ForkBranchSpec {
  return {
    branch,
    name: `${branch} branch`,
    iconId: `icon.${branch}`,
    prereqs: [],
    unlocks: `power.${branch}`,
    description: `The ${branch} way down.`,
    label: 'horizontal',
    marks,
  }
}

function priceRowOf(node: TreeNode) {
  return PLANETS.map((planet) => nodeCost(node, planet))
}

function markNodesOf(node: TreeNode, ladder: MarkLadder, lastMark: number): TreeNode[] {
  const bearer = markBearerOf(node, ladder)
  return Array.from({ length: lastMark - 1 }, (_, index) => markNodeOf(bearer, index + 2))
}

describe('tech tree: fork cost', () => {
  it('prices the two branches of every lane the same with bandOrePriceAt on P16-P60', () => {
    for (const lane of TECH_LANES) {
      const pair = forkPairOf(lane, [
        branchSpecOf('wide', LONG_LADDER),
        branchSpecOf('deep', SHORT_LADDER),
      ])
      for (const depth of DEPTHS) {
        const [first, second] = forkTreeNodesOf(pair, depth)
        expect(priceRowOf(second)).toEqual(priceRowOf(first))
        expect(nodeCost(first, 30)).toEqual(bandOrePriceAt(nodeOreCostOf(first), 30, 16))
      }
    }
  })

  it('prices every Mark step of the two branches the same on P16-P60', () => {
    const pair = forkPairOf('drill-gear', [
      branchSpecOf('wide', LONG_LADDER),
      branchSpecOf('deep', SHORT_LADDER),
    ])
    const [first, second] = forkTreeNodesOf(pair, 4)
    const steps = Math.min(lastMarkOf(LONG_LADDER), lastMarkOf(SHORT_LADDER))
    expect(steps).toBeGreaterThan(2)
    const firstMarks = markNodesOf(first, LONG_LADDER, steps)
    const secondMarks = markNodesOf(second, SHORT_LADDER, steps)
    expect(secondMarks.map(priceRowOf)).toEqual(firstMarks.map(priceRowOf))
  })
})
