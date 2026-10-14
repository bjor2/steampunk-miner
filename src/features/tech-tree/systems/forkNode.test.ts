import { describe, expect, it } from 'vitest'
import {
  activeBranchOf,
  chooseBranch,
  FORK_TIER,
  forkPairOf,
  forkTreeNodesOf,
  NO_FORK_CHOICES,
  type ForkBranchSpec,
} from './forkNode'

function branchSpecOf(branch: string): ForkBranchSpec {
  return {
    branch,
    name: branch,
    iconId: `icon.${branch}`,
    prereqs: [],
    unlocks: `power.${branch}`,
    description: `The ${branch} way down.`,
    label: 'horizontal',
  }
}

const AGILE_ARMOURED = forkPairOf('mobility', [branchSpecOf('agile'), branchSpecOf('armoured')])

describe('tech tree: fork node', () => {
  it('names both branches tech.<lane>.fork.<branch> under one pair id, in snake case', () => {
    const pair = forkPairOf('drill-gear', [branchSpecOf('wide'), branchSpecOf('deep')])
    expect(pair.id).toBe('tech.drill_gear.fork')
    expect(pair.branches.map((node) => node.id)).toEqual([
      'tech.drill_gear.fork.wide',
      'tech.drill_gear.fork.deep',
    ])
    expect(pair.branches.every((node) => node.pairId === pair.id)).toBe(true)
  })

  it('makes both branches capabilities on tier 16', () => {
    const shapes = AGILE_ARMOURED.branches.map(({ costKind, unlockTier }) => ({
      costKind,
      unlockTier,
    }))
    expect(shapes).toEqual([
      { costKind: 'capability', unlockTier: FORK_TIER },
      { costKind: 'capability', unlockTier: FORK_TIER },
    ])
    expect(FORK_TIER).toBe(16)
  })

  it('gives both branches the one depth the pair sits at in the tree', () => {
    const depths = forkTreeNodesOf(AGILE_ARMOURED, 5).map((node) => node.depthTerm)
    expect(depths).toEqual([5, 5])
  })

  it('refuses a pair that names the same branch twice', () => {
    expect(() => forkPairOf('sensing', [branchSpecOf('scout'), branchSpecOf('scout')])).toThrow(
      /scout/,
    )
  })
})

describe('tech tree: fork choice', () => {
  it('has no active branch before the lane chooses', () => {
    expect(activeBranchOf(NO_FORK_CHOICES, 'mobility')).toBeNull()
  })

  it('choosing a branch deactivates the other', () => {
    const agile = chooseBranch(NO_FORK_CHOICES, 'mobility', 'agile')
    const armoured = chooseBranch(agile, 'mobility', 'armoured')
    expect(activeBranchOf(agile, 'mobility')).toBe('agile')
    expect(activeBranchOf(armoured, 'mobility')).toBe('armoured')
    expect(Object.values(armoured)).not.toContain('agile')
  })

  it('leaves the earlier state and the other lanes as they were', () => {
    const before = chooseBranch(NO_FORK_CHOICES, 'terrain', 'breaker')
    const after = chooseBranch(before, 'mobility', 'agile')
    expect(activeBranchOf(before, 'mobility')).toBeNull()
    expect(activeBranchOf(after, 'terrain')).toBe('breaker')
  })
})
