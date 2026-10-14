import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import { bandOrePriceAt, bandOreWorthAt } from '../../../systems/economy/bandOreCost'
import { ceilMilli, cmp, fromCanonical, mul, powInt, type Money } from '../../../systems/money'
import { TREE_FIXTURE_SLICE } from '../treeFixtureSlice'
import { markNodeIdOf } from './markNodes'
import { nodeCost, nodeOreCostOf } from './nodeCost'
import { registeredTechTree, treeNodeOf, type TechTree } from './techTree'
import { TREE_ECONOMY } from './treeEconomy'
import type { TechCostKind, TreeNode } from './techNode'

// Spec #161 section 3, final: k_kind, g and the band, written out here so the table checks the
// slice's economy file against the spec rather than against itself.
const K_KIND: Record<TechCostKind, string> = {
  capability: '12',
  slot: '20',
  combo: '20',
  mark: '4',
}
const G = fromCanonical('1.04')
const BAND = 5

const SAMPLE_IDS = [
  'tech.sensing.echo_sounder',
  'tech.mobility.escape_thruster',
  'tech.terrain.cradle_4',
  'tech.combo.ceiling_anchor',
  'tech.mark.power.echo_sounder.2',
  'tech.mark.power.echo_sounder.14',
  'tech.combo.gen.41',
  'tech.combo.gen.71',
]

function specOreUnitsOf(node: TreeNode): Money {
  return mul(fromCanonical(K_KIND[node.costKind]), powInt(G, node.depthTerm))
}

function withFixtureTree<T>(run: (tree: TechTree) => T): T {
  return withRegistrations([TREE_FIXTURE_SLICE], () => run(registeredTechTree()))
}

function nodeOf(tree: TechTree, id: string): TreeNode {
  const node = treeNodeOf(tree, id)
  if (node === null) throw new Error(`no node ${id}`)
  return node
}

describe('tech tree: node cost', () => {
  it('charges bandOrePriceAt of k g^depth band-5 units at its price anchor, for every kind', () => {
    withFixtureTree((tree) => {
      for (const node of SAMPLE_IDS.map((id) => nodeOf(tree, id))) {
        const cost = { band: BAND, oreUnits: specOreUnitsOf(node) }
        expect(nodeCost(node)).toEqual(bandOrePriceAt(cost, node.unlockTier, node.unlockTier))
      }
    })
  })

  it('is the ceilMilli of the worth, never the raw worth', () => {
    withFixtureTree((tree) => {
      const node = nodeOf(tree, 'tech.drill_gear.reach_boom')
      const worth = bandOreWorthAt(nodeOreCostOf(node), node.unlockTier, node.unlockTier)
      expect(nodeCost(node)).toEqual(ceilMilli(worth))
    })
  })

  it('covers every cost kind in the sample', () => {
    withFixtureTree((tree) => {
      const kinds = new Set(SAMPLE_IDS.map((id) => nodeOf(tree, id).costKind))
      expect([...kinds].sort()).toEqual(['capability', 'combo', 'mark', 'slot'])
    })
  })

  it('pins the capability price at its planet 2 anchor (#411: the price the node used to open at)', () => {
    withFixtureTree((tree) => {
      const units = { band: BAND, oreUnits: fromCanonical('12') }
      expect(nodeCost(nodeOf(tree, 'tech.sensing.echo_sounder'))).toEqual(
        bandOrePriceAt(units, 2, 2),
      )
    })
  })

  it('prices a later Mark of an item above an earlier one, as its anchor is further on', () => {
    withFixtureTree((tree) => {
      const priceOf = (mark: number) =>
        nodeCost(nodeOf(tree, markNodeIdOf('power.echo_sounder', mark)))
      expect(cmp(priceOf(3), priceOf(2))).toBe(1)
      expect(cmp(priceOf(14), priceOf(10))).toBe(1)
    })
  })

  it('prices a Mark past 10 in the same ore units as Mark 10: only the ore value moves', () => {
    withFixtureTree((tree) => {
      const unitsOf = (mark: number) =>
        nodeOreCostOf(nodeOf(tree, markNodeIdOf('power.echo_sounder', mark)))
      expect(unitsOf(14)).toEqual(unitsOf(10))
      expect(unitsOf(18)).toEqual(unitsOf(10))
      expect(cmp(unitsOf(10).oreUnits, unitsOf(9).oreUnits)).toBe(1)
    })
  })

  it("prices an armoury lane by its weapon's own laneBias key, 1 on day one (#310)", () => {
    withFixtureTree((tree) => {
      const node = {
        ...nodeOf(tree, 'tech.sensing.echo_sounder'),
        lane: 'armoury.bore_gun' as const,
      }
      const doubled = { ...TREE_ECONOMY.costs, laneBias: { bore_gun: fromCanonical('2') } }
      expect(TREE_ECONOMY.costs.laneBias).toEqual({
        bore_gun: fromCanonical('1'),
        auto_guns: fromCanonical('1'),
      })
      expect(nodeOreCostOf(node).oreUnits).toEqual(specOreUnitsOf(node))
      expect(nodeOreCostOf(node, doubled).oreUnits).toEqual(
        mul(specOreUnitsOf(node), fromCanonical('2')),
      )
    })
  })
})
