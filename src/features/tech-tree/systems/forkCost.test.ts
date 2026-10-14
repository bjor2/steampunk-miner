import { describe, expect, it } from 'vitest'
import { bandOrePriceAt } from '../../../systems/economy/bandOreCost'
import { FORK_FIXTURE_SLICE, FORK_PAIRS_FIXTURE } from '../treeFixtureSlice'
import { withFixtureTree } from '../treeTestSession'
import { forkPairOf, forkTreeNodesOf, type ForkBranchSpec, type ForkPair } from './forkNode'
import { lastMarkOf } from './markLadder'
import { markBearerOf, markNodeOf } from './markNodes'
import { nodeCost, nodeOreCostOf } from './nodeCost'
import { TECH_LANES, type MarkLadder, type TreeNode } from './techNode'
import { markBearerOfItem, registeredTechTree, treeNodeOf, type TechTree } from './techTree'

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

/** Both branches of the pair as the registered tree holds them. */
function registeredBranchesOf(tree: TechTree, pair: ForkPair): [TreeNode, TreeNode] {
  const [first, second] = pair.branches.map((branch) => treeNodeOf(tree, branch.id)!)
  return [first, second]
}

/** Every Mark step both branches have, as the registered tree generates them. */
function registeredMarkStepsOf(tree: TechTree, branches: readonly TreeNode[]): TreeNode[][] {
  const bearers = branches.map((node) => markBearerOfItem(tree, node.unlocks.itemId)!)
  const steps = Math.min(...bearers.map((bearer) => bearer.lastMark))
  return bearers.map((bearer) =>
    Array.from({ length: steps - 1 }, (_, index) => markNodeOf(bearer, index + 2)),
  )
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

  it('the two branches of every lane cost the same on P16-P60, in the registered tree', () => {
    withFixtureTree(() => {
      const tree = registeredTechTree()
      for (const pair of FORK_PAIRS_FIXTURE) {
        const [first, second] = registeredBranchesOf(tree, pair)
        expect(priceRowOf(second)).toEqual(priceRowOf(first))
        const [firstMarks, secondMarks] = registeredMarkStepsOf(tree, [first, second])
        expect(firstMarks.length).toBeGreaterThan(2)
        expect(secondMarks.map(priceRowOf)).toEqual(firstMarks.map(priceRowOf))
      }
    }, [FORK_FIXTURE_SLICE])
  })

  it('gives a pair one lane slot, so the lane after the fork sits one deeper, not two', () => {
    const laneDepthsOf = (tree: TechTree) =>
      tree.authored.filter((node) => node.lane === 'sensing').map((node) => node.depthTerm)
    const withoutFork = withFixtureTree(() => laneDepthsOf(registeredTechTree()))
    const withFork = withFixtureTree(() => laneDepthsOf(registeredTechTree()), [FORK_FIXTURE_SLICE])
    const forkSlot = withFixtureTree(() => {
      const tree = registeredTechTree()
      return registeredBranchesOf(tree, FORK_PAIRS_FIXTURE[2]).map((node) => node.depthTerm)
    }, [FORK_FIXTURE_SLICE])
    expect(forkSlot[0]).toBe(forkSlot[1])
    const before = withoutFork.filter((depth) => depth < forkSlot[0])
    const after = withoutFork.filter((depth) => depth >= forkSlot[0]).map((depth) => depth + 1)
    expect(withFork).toEqual([...before, ...forkSlot, ...after])
  })
})
