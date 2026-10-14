import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import { contentOf } from '../../../systems/registries/content'
import { COMBO_HOLDS, COMBO_TEMPLATES } from '../../combos'
import { TREE_FIXTURE_SLICE } from '../treeFixtureSlice'
import {
  generatedComboAt,
  LANE_PAIRS,
  PAIR_ORDER,
  pairIndexAt,
  pairIndexOf,
} from './generatedCombos'
import { itemUnlockTierOf, registeredTechTree, treeNodeOf, treeNodesThrough } from './techTree'
import type { TechTree } from './techTree'
import type { TechComboTemplate, TreeNode } from './techNode'

/** One combo every 3 planets from P41: each of the fifteen pairs takes its first turn by P83. */
const FIRST_TURNS = [41, 44, 47, 50, 53, 56, 59, 62, 65, 68, 71, 74, 77, 80, 83]

function withFixtureTree<T>(run: (tree: TechTree) => T): T {
  return withRegistrations([TREE_FIXTURE_SLICE], () => run(registeredTechTree()))
}

function nodeOf(tree: TechTree, id: string): TreeNode {
  const node = treeNodeOf(tree, id)
  if (node === null) throw new Error(`no node ${id}`)
  return node
}

function generatedThrough(tree: TechTree, planetIndex: number): TreeNode[] {
  return treeNodesThrough(tree, planetIndex).filter((node) => node.id.startsWith('tech.combo.gen.'))
}

describe('tech tree: generated combos', () => {
  it('generates no combo before planet 41, then one every 3 planets through P86', () => {
    withFixtureTree((tree) => {
      expect(generatedThrough(tree, 86).map((node) => node.unlockTier)).toEqual([
        ...FIRST_TURNS,
        86,
      ])
    })
  })

  it('takes the fifteen lane pairs of the six lanes in a fixed permutation', () => {
    expect(LANE_PAIRS).toHaveLength(15)
    expect([...PAIR_ORDER].sort((a, b) => a - b)).toEqual([...LANE_PAIRS.keys()])
    expect(LANE_PAIRS.filter((pair) => pair.includes('aetheric'))).toHaveLength(5)
  })

  it('gives every pair its first turn by P86, then starts the round again', () => {
    const firstRound = FIRST_TURNS.map(pairIndexAt)
    expect(new Set(firstRound).size).toBe(15)
    expect(pairIndexAt(86)).toBe(pairIndexAt(41))
    expect([40, 42, 43, 85].map(pairIndexAt)).toEqual([null, null, null, null])
  })

  it('grades each pair on: horizontal on its first appearance, both after', () => {
    withFixtureTree((tree) => {
      const firstRound = FIRST_TURNS.map((p) => nodeOf(tree, `tech.combo.gen.${p}`))
      const newTemplates = firstRound.filter((node) => node.unlocks.mark === 1)
      expect(newTemplates).toHaveLength(9)
      expect(newTemplates.every((node) => node.label === 'horizontal')).toBe(true)
      expect(
        firstRound.filter((node) => node.unlocks.mark === 2).every((n) => n.label === 'both'),
      ).toBe(true)
      expect(nodeOf(tree, 'tech.combo.gen.86').unlocks).toEqual({
        itemId: firstRound[0].unlocks.itemId,
        mark: firstRound[0].unlocks.mark + 1,
      })
    })
  })

  it("needs its template's parents and the grade before it", () => {
    withFixtureTree((tree) => {
      const later = nodeOf(tree, 'tech.combo.gen.86')
      expect(later.prereqs).toContain('tech.combo.gen.41')
      expect(later.prereqs).toHaveLength(3)
      expect(later).toMatchObject({ lane: 'combo', costKind: 'combo', kind: 'combo' })
    })
  })

  it('offers every player the same combos: the pair order is a constant, never the world seed', () => {
    expect(PAIR_ORDER).toEqual([8, 14, 9, 3, 6, 4, 7, 1, 11, 2, 10, 0, 13, 5, 12])
    const generatedOf = () => withFixtureTree((tree) => generatedThrough(tree, 130))
    expect(generatedOf()).toEqual(generatedOf())
  })

  it('unlocks an endless-only combo with its first generated grade, an authored one at its node', () => {
    withFixtureTree((tree) => {
      const firstGrade = treeNodesThrough(tree, 100).find(
        (node) => node.unlocks.itemId === 'combo.lodestone_drain',
      )
      expect(firstGrade?.unlocks.mark).toBe(1)
      expect(itemUnlockTierOf(tree, 'combo.lodestone_drain')).toBe(firstGrade?.unlockTier)
      expect(itemUnlockTierOf(tree, 'combo.assay_drain')).toBe(
        nodeOf(tree, 'tech.combo.assay_drain').unlockTier,
      )
      expect(itemUnlockTierOf(tree, 'combo.no_such_combo')).toBeNull()
    })
  })

  it("needs every grade's template items owned, as an authored node's requiresOwned", () => {
    const owning: TechComboTemplate = {
      id: 'tech.template.owning',
      iconId: 'node-combo-owning',
      lanes: LANE_PAIRS[PAIR_ORDER[0]],
      name: 'Owning',
      unlocks: 'combo.owning',
      parents: ['tech.a.first', 'tech.b.second'],
      description: 'A combo that asks for both parents in the hold.',
      requiresOwned: ['power.first', 'power.second'],
    }
    const grading = {
      templateOfPair: (pairIndex: number) => (pairIndex === pairIndexAt(41) ? owning : null),
      authoredComboOf: () => null,
      slots: new Map<string, number>(),
    }
    const graded = [41, 86].map((planet) => generatedComboAt(planet, grading))
    graded.forEach((node) => expect(node?.requiresOwned).toEqual(owning.requiresOwned))
  })

  it('has fifteen real templates, one a pair, and keeps the aetheric stand-ins fixture-only', () => {
    const pairsOf = (templates: readonly TechComboTemplate[]) =>
      new Set(templates.map((template) => pairIndexOf(template.lanes)))
    expect(COMBO_TEMPLATES).toHaveLength(15)
    expect([...pairsOf(COMBO_TEMPLATES)].sort((a, b) => a - b)).toEqual([...LANE_PAIRS.keys()])
    const registered = contentOf('tech-combo-template')
    const shipped = COMBO_TEMPLATES.filter(
      (template) => !Object.hasOwn(COMBO_HOLDS, template.unlocks),
    )
    expect(registered.map((template) => template.id).sort()).toEqual(
      shipped.map((template) => template.id).sort(),
    )
    expect(registered.some((template) => template.id.includes('aetheric_pair'))).toBe(false)
  })

  it('generates nothing for a pair with no template registered', () => {
    const empty = withRegistrations([], () => treeNodesThrough(registeredTechTree(), 100))
    expect(empty).toEqual([])
  })
})
