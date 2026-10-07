import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import { bandOrePrice, bandOrePriceAt, bandOreWorthAt } from '../../../systems/economy/bandOreCost'
import { ceilMilli, cmp, fromCanonical, mul, powInt, type Money } from '../../../systems/money'
import { TREE_FIXTURE_SLICE } from '../treeFixtureSlice'
import { markNodeIdOf } from './markNodes'
import { nodeCost, nodeOreCostOf } from './nodeCost'
import { registeredTechTree, treeNodeOf, type TechTree } from './techTree'
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

const PLANETS = [...Array.from({ length: 60 }, (_, index) => index + 1), 247, 607, 6007]

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
  it('charges bandOrePriceAt of k g^depth band-5 units, paced at the unlock planet, for every kind', () => {
    withFixtureTree((tree) => {
      for (const node of SAMPLE_IDS.map((id) => nodeOf(tree, id))) {
        const cost = { band: BAND, oreUnits: specOreUnitsOf(node) }
        for (const planet of PLANETS) {
          expect(nodeCost(node, planet)).toEqual(bandOrePriceAt(cost, planet, node.unlockTier))
        }
      }
    })
  })

  it('is the ceilMilli of the worth, never the raw worth', () => {
    withFixtureTree((tree) => {
      const node = nodeOf(tree, 'tech.drill-gear.reach_boom')
      const worth = bandOreWorthAt(nodeOreCostOf(node), 6007, node.unlockTier)
      expect(nodeCost(node, 6007)).toEqual(ceilMilli(worth))
    })
  })

  it('covers every cost kind in the sample', () => {
    withFixtureTree((tree) => {
      const kinds = new Set(SAMPLE_IDS.map((id) => nodeOf(tree, id).costKind))
      expect([...kinds].sort()).toEqual(['capability', 'combo', 'mark', 'slot'])
    })
  })

  it('pins the capability price at L 247, 607 and 6007', () => {
    withFixtureTree((tree) => {
      const echo = nodeOf(tree, 'tech.sensing.echo_sounder')
      const prices = [247, 607, 6007].map((planet) => nodeCost(echo, planet))
      const units = { band: BAND, oreUnits: fromCanonical('12') }
      expect(prices).toEqual([247, 607, 6007].map((p) => bandOrePriceAt(units, p, 2)))
      expect(cmp(prices[1], prices[0])).toBe(1)
      expect(cmp(prices[2], prices[1])).toBe(1)
    })
  })

  it('never makes a node from planets 3 to 7 cheaper in pace by waiting for planet 8', () => {
    withFixtureTree((tree) => {
      const early = tree.authored.filter((node) => node.unlockTier >= 3 && node.unlockTier <= 7)
      expect(early.length).toBeGreaterThan(0)
      for (const node of early) {
        const cost = nodeOreCostOf(node)
        expect(cmp(nodeCost(node, 8), bandOrePrice(cost, 8))).toBe(1)
        expect(cmp(nodeCost(node, 8), nodeCost(node, node.unlockTier))).toBe(1)
      }
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
})
