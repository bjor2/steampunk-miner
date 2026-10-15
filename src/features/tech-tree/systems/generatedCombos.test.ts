import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import { contentOf } from '../../../systems/registries/content'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { authoredComboNodesOf, COMBO_HOLDS, COMBO_ITEMS, COMBO_TEMPLATES } from '../../combos'
import { TREE_FIXTURE_SLICE } from '../treeFixtureSlice'
import {
  generatedComboAt,
  isWeaponTemplate,
  LANE_PAIRS,
  PAIR_ORDER,
  pairIndexAt,
  pairIndexOf,
  rotationLengthOf,
} from './generatedCombos'
import { itemUnlockTierOf, registeredTechTree, treeNodeOf, treeNodesThrough } from './techTree'
import type { TechTree } from './techTree'
import { isArmouryLane, type TechComboTemplate, type TreeNode } from './techNode'

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
      weaponTemplates: [],
      authoredComboOf: () => null,
      slots: new Map<string, number>(),
    }
    const graded = [41, 86].map((planet) => generatedComboAt(planet, grading))
    graded.forEach((node) => expect(node?.requiresOwned).toEqual(owning.requiresOwned))
  })

  it('has fifteen real pair templates, one a pair, and keeps the aetheric stand-ins fixture-only', () => {
    const pairTemplates = COMBO_TEMPLATES.filter((template) => !isWeaponTemplate(template))
    const pairsOf = (templates: readonly TechComboTemplate[]) =>
      new Set(templates.map((template) => pairIndexOf(template.lanes)))
    expect(pairTemplates).toHaveLength(15)
    expect([...pairsOf(pairTemplates)].sort((a, b) => a - b)).toEqual([...LANE_PAIRS.keys()])
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

/** The weapon x lane combos' templates and authored nodes (ticket 320), as a slice would register them. */
const WEAPON_COMBO_SLICE: SliceDefinition = {
  id: 'combos',
  register(r) {
    r.content('tech-combo-template', COMBO_TEMPLATES.filter(isWeaponTemplate))
    r.content(
      'tech-node',
      authoredComboNodesOf(COMBO_ITEMS.filter((item) => item.lanes.some(isArmouryLane))),
    )
  },
}

function withWeaponTemplates<T>(run: (tree: TechTree) => T): T {
  return withRegistrations([TREE_FIXTURE_SLICE, WEAPON_COMBO_SLICE], () =>
    run(registeredTechTree()),
  )
}

describe('tech tree: weapon x lane templates in the endless rotation', () => {
  it('pins the shipped weapon turns on P86, P89 and P92 and the next lap on P95', () => {
    const tree = registeredTechTree()
    const lapOne = nodeOf(tree, 'tech.combo.gen.41')
    expect(rotationLengthOf(tree.grading)).toBe(18)
    expect([86, 89, 92].map((p) => nodeOf(tree, `tech.combo.gen.${p}`).unlocks.itemId)).toEqual([
      'combo.sounding_bore',
      'combo.spotter_guns',
      'combo.winch_bore',
    ])
    expect(nodeOf(tree, 'tech.combo.gen.95').unlocks).toEqual({
      itemId: lapOne.unlocks.itemId,
      mark: lapOne.unlocks.mark + 1,
    })
  })

  it('never makes a lane pair of an armoury lane, so a weapon template stands for no pair', () => {
    expect(LANE_PAIRS.some((pair) => pair.some(isArmouryLane))).toBe(false)
    COMBO_TEMPLATES.filter(isWeaponTemplate).forEach((template) =>
      expect(pairIndexOf(template.lanes), template.id).toBe(-1),
    )
  })

  it("keeps the pairs' first lap, then gives each weapon template one turn in id order", () => {
    const pairsOnly = withFixtureTree((tree) => generatedThrough(tree, 83))
    withWeaponTemplates((tree) => {
      expect(rotationLengthOf(tree.grading)).toBe(18)
      expect(generatedThrough(tree, 83)).toEqual(pairsOnly)
      expect([86, 89, 92].map((p) => nodeOf(tree, `tech.combo.gen.${p}`).unlocks.itemId)).toEqual([
        'combo.sounding_bore',
        'combo.spotter_guns',
        'combo.winch_bore',
      ])
      expect([86, 89, 92].map((p) => pairIndexAt(p, 3))).toEqual([null, null, null])
    })
  })

  it('starts the next lap after the weapon turns, each pair one grade on', () => {
    withWeaponTemplates((tree) => {
      const first = nodeOf(tree, 'tech.combo.gen.41')
      const again = nodeOf(tree, 'tech.combo.gen.95')
      expect(again.unlocks).toEqual({ itemId: first.unlocks.itemId, mark: first.unlocks.mark + 1 })
      expect(again.prereqs).toContain('tech.combo.gen.41')
      expect(pairIndexAt(95, 3)).toBe(pairIndexAt(41))
    })
  })

  it('grades a weapon combo on from its authored node, behind the lab and its anchor', () => {
    withWeaponTemplates((tree) => {
      const sounding = nodeOf(tree, 'tech.combo.gen.86')
      expect(sounding.unlocks.mark).toBe(2)
      expect(sounding.label).toBe('both')
      expect(sounding.prereqs).toContain('tech.combo.sounding_bore')
      expect(sounding.requiresFeature).toEqual(['research_lab', 'bore_gun'])
      expect(nodeOf(tree, 'tech.combo.gen.89').requiresFeature).toEqual([
        'research_lab',
        'auto_guns',
      ])
      expect(nodeOf(tree, 'tech.combo.gen.41').requiresFeature).toBeUndefined()
    })
  })
})
