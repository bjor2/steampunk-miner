import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import { TREE_FIXTURE_SLICE } from '../treeFixtureSlice'
import { LANE_PAIRS, PAIR_ORDER } from './generatedCombos'
import { markNodeIdOf } from './markNodes'
import { registeredTechTree, treeNodeOf, treeNodesThrough, type TechTree } from './techTree'
import type { TreeNode } from './techNode'

function withFixtureTree<T>(run: (tree: TechTree) => T): T {
  return withRegistrations([TREE_FIXTURE_SLICE], () => run(registeredTechTree()))
}

function nodeOf(tree: TechTree, id: string): TreeNode {
  const node = treeNodeOf(tree, id)
  if (node === null) throw new Error(`no node ${id}`)
  return node
}

describe('tech tree: structure', () => {
  it('counts each capability by its lane slot, mobility from 0 to 10', () => {
    withFixtureTree((tree) => {
      const mobility = tree.authored.filter((node) => node.lane === 'mobility')
      expect(mobility.map((node) => node.depthTerm)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      expect(nodeOf(tree, 'tech.sensing.hazard_barometer').depthTerm).toBe(3)
    })
  })

  it('puts a combo one past its deeper parent: magnetic survey 2, ceiling anchor 9', () => {
    withFixtureTree((tree) => {
      expect(nodeOf(tree, 'tech.combo.magnetic_survey').depthTerm).toBe(2)
      expect(nodeOf(tree, 'tech.combo.ceiling_anchor').depthTerm).toBe(9)
    })
  })

  it('works the kind out from the data: capability, combo or Mark', () => {
    withFixtureTree((tree) => {
      expect(nodeOf(tree, 'tech.sensing.echo_sounder').kind).toBe('capability')
      expect(nodeOf(tree, 'tech.combo.assay_drain').kind).toBe('combo')
      expect(nodeOf(tree, markNodeIdOf('power.echo_sounder', 2)).kind).toBe('mark')
    })
  })

  it('answers null for an id no node has', () => {
    withFixtureTree((tree) => {
      expect(treeNodeOf(tree, 'tech.sensing.nothing')).toBeNull()
      expect(treeNodeOf(tree, 'tech.mark.power.echo_sounder.1')).toBeNull()
      expect(treeNodeOf(tree, 'tech.mark.rig.resonance.2')).toBeNull()
      expect(treeNodeOf(tree, 'tech.combo.gen.42')).toBeNull()
    })
  })
})

describe('tech tree: Marks', () => {
  it('bears Marks on the 36 power-ups, consumables, passives and drill gear only', () => {
    withFixtureTree((tree) => {
      const items = tree.markBearers.map((bearer) => bearer.capability.unlocks.itemId)
      expect(items).toHaveLength(36)
      expect(items.some((item) => /^(rig|slot|combo)\./.test(item))).toBe(false)
    })
  })

  it('puts Mark N at unlockTier + 3(N - 1), needing Mark N - 1', () => {
    withFixtureTree((tree) => {
      const second = nodeOf(tree, 'tech.mark.power.echo_sounder.2')
      const fifth = nodeOf(tree, 'tech.mark.power.echo_sounder.5')
      expect(second).toMatchObject({
        unlockTier: 5,
        prereqs: ['tech.sensing.echo_sounder'],
        unlocks: { itemId: 'power.echo_sounder', mark: 2 },
        label: 'both',
        costKind: 'mark',
      })
      expect(fifth).toMatchObject({ unlockTier: 14, prereqs: ['tech.mark.power.echo_sounder.4'] })
    })
  })

  it('adds the Mark to the item slot as depth, capped at Mark 10', () => {
    withFixtureTree((tree) => {
      const depthOf = (mark: number) =>
        nodeOf(tree, markNodeIdOf('power.echo_sounder', mark)).depthTerm
      expect([depthOf(2), depthOf(10), depthOf(12), depthOf(18)]).toEqual([2, 10, 10, 10])
    })
  })

  it('ends a ladder at mastery: no Mark exists past it', () => {
    withFixtureTree((tree) => {
      expect(treeNodeOf(tree, 'tech.mark.power.echo_sounder.18')).not.toBeNull()
      expect(treeNodeOf(tree, 'tech.mark.power.echo_sounder.19')).toBeNull()
    })
  })

  it('offers Marks from the campaign on, so they do not all appear at planet 41', () => {
    withFixtureTree((tree) => {
      const marksBy = (planet: number) =>
        treeNodesThrough(tree, planet).filter((node) => node.kind === 'mark').length
      expect(marksBy(5)).toBeGreaterThan(0)
      expect(marksBy(40)).toBeGreaterThan(marksBy(20))
    })
  })
})

describe('tech tree: generated combos', () => {
  it('generates no combo before planet 41, then one every 3 planets', () => {
    withFixtureTree((tree) => {
      const generated = treeNodesThrough(tree, 70).filter((node) =>
        node.id.startsWith('tech.combo.gen.'),
      )
      expect(generated.map((node) => node.unlockTier)).toEqual([
        41, 44, 47, 50, 53, 56, 59, 62, 65, 68,
      ])
    })
  })

  it('takes the lane pairs in a fixed permutation of all ten', () => {
    expect([...PAIR_ORDER].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(LANE_PAIRS).toHaveLength(10)
  })

  it('grades each pair on: horizontal on its first appearance, both after', () => {
    withFixtureTree((tree) => {
      const firstTen = [41, 44, 47, 50, 53, 56, 59, 62, 65, 68].map((p) =>
        nodeOf(tree, `tech.combo.gen.${p}`),
      )
      const newTemplates = firstTen.filter((node) => node.unlocks.mark === 1)
      expect(newTemplates).toHaveLength(4)
      expect(newTemplates.every((node) => node.label === 'horizontal')).toBe(true)
      expect(
        firstTen.filter((node) => node.unlocks.mark === 2).every((n) => n.label === 'both'),
      ).toBe(true)
      expect(nodeOf(tree, 'tech.combo.gen.71').unlocks).toEqual({
        itemId: firstTen[0].unlocks.itemId,
        mark: firstTen[0].unlocks.mark + 1,
      })
    })
  })

  it("needs its template's parents and the grade before it", () => {
    withFixtureTree((tree) => {
      const later = nodeOf(tree, 'tech.combo.gen.71')
      expect(later.prereqs).toContain('tech.combo.gen.41')
      expect(later.prereqs).toHaveLength(3)
      expect(later).toMatchObject({ lane: 'combo', costKind: 'combo', kind: 'combo' })
    })
  })

  it('generates the same ids, tiers and unlocks on every run', () => {
    const generatedOf = () =>
      withFixtureTree((tree) => treeNodesThrough(tree, 100).filter((node) => node.unlockTier > 40))
    expect(generatedOf()).toEqual(generatedOf())
  })

  it('generates nothing for a pair with no template registered', () => {
    const empty = withRegistrations([], () => treeNodesThrough(registeredTechTree(), 100))
    expect(empty).toEqual([])
  })
})
