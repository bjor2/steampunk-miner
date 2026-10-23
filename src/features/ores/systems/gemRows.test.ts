import { describe, expect, it } from 'vitest'
import { ORE_RULES_VERSION, P1_GEMS_ORE_RULES } from '../../../systems/world/planetParams'
import economyFile from '../ores.economy.json'
import familiesFile from '../oreFamilies.json'
import { gemTierLeadOf } from './gemRows'
import { ORE_ROWS, oreRowProblems } from './oreRows'

// The gem table (ticket 713, Systems' decision on #713; ticket 741, Systems' final spec): each pool
// names its gem kind slots cheapest first, and the k-th sells Δ_k tiers above the planet's top ore
// tier, the one ladder 5, 6 and 8 fixed from P1. Refused whole when a row breaks a rule.

/** The shipped files with the gems block replaced. */
function problemsWithGems(gems: unknown): string[] {
  return oreRowProblems({ ore: { ...economyFile.ore, gems } }, familiesFile)
}

const LEGACY_GEMS = {
  pool: 'legacy',
  fromOreRules: 12,
  slots: ['legacy.g1', 'legacy.g2', 'legacy.g3'],
}

describe('the gem table', () => {
  it('ships the one ladder fixed from P1, Δ 5, 6 and 8', () => {
    expect(ORE_ROWS.gems.tierLeads).toEqual([5, 6, 8])
  })

  it("names P1's Diamond, Emerald and Ruby slots as the legacy pool's gems from ore rules 12", () => {
    expect(ORE_ROWS.gems.pools.find((row) => row.pool === 'legacy')).toEqual({
      pool: 'legacy',
      fromOreRules: P1_GEMS_ORE_RULES,
      slotIds: ['legacy.g1', 'legacy.g2', 'legacy.g3'],
    })
  })

  it("gives a gem slot its rank's lead only on its pool, from its ore rules", () => {
    const leadOf = (pool: string | null, slotId: string, rules?: number) =>
      gemTierLeadOf(ORE_ROWS.gems, pool, slotId, rules)
    expect(
      ['legacy.g1', 'legacy.g2', 'legacy.g3'].map((slot) => leadOf('legacy', slot, 12)),
    ).toEqual([5, 6, 8])
    expect(leadOf('legacy', 'legacy.g1', P1_GEMS_ORE_RULES - 1)).toBeNull()
    expect(leadOf('legacy', 'legacy.g1')).toBeNull()
    expect(leadOf('legacy', 'legacy.r1', 12)).toBeNull()
    expect(leadOf(null, 'legacy.g1', 12)).toBeNull()
  })

  it('accepts the shipped table', () => {
    expect(problemsWithGems(economyFile.ore.gems)).toEqual([])
  })

  it('refuses a ladder that is not whole numbers from 1, rising', () => {
    for (const tierLeads of [[], [5, 5, 8], [0, 6, 8], [5, 6.5, 8], 'five']) {
      expect(problemsWithGems({ tierLeads, pools: [] })).toEqual([
        'ore.gems.tierLeads must be whole numbers from 1, rising',
      ])
    }
  })

  it('refuses a pool the registry lacks, unknown rules, a wrong count and a pool named twice', () => {
    const pools = [
      {
        ...LEGACY_GEMS,
        pool: 'foothold-p99',
        fromOreRules: 1,
        slots: ['legacy.r1', 'legacy.r2', 'legacy.r3'],
      },
      { ...LEGACY_GEMS, slots: ['legacy.g1', 'legacy.g2'] },
      LEGACY_GEMS,
    ]
    expect(problemsWithGems({ tierLeads: [5, 6, 8], pools })).toEqual([
      'ore.gems.pools[0].pool must name a pool',
      `ore.gems.pools[0].fromOreRules must be an ore rules version from 2 to ${ORE_RULES_VERSION}`,
      'ore.gems.pools[1].slots must name 3 kind slots, cheapest first',
      'ore.gems.pools names pool "legacy" twice',
    ])
  })

  it("refuses a slot that is missing, another pool's, below rare, repeated or from two tables", () => {
    const slots = [
      ['legacy.g9', 'legacy.r1', 'legacy.r1'],
      ['legacy.r4', 'legacy.g2', 'legacy.g3'],
      ['legacy.u1', 'legacy.g2', 'mixed.m1'],
    ]
    const pools = slots.map((row, at) => ({
      ...LEGACY_GEMS,
      pool: ['legacy', 'foothold-p3', 'foothold-p4'][at],
      slots: row,
    }))
    expect(problemsWithGems({ tierLeads: [5, 6, 8], pools })).toEqual([
      'ore.gems.pools[0].slots[0] must name a kind slot',
      'ore.gems.pools[0].slots names a slot twice',
      "ore.gems.pools[1].slots[0] is another pool's slot",
      "ore.gems.pools[1].slots[1] is another pool's slot",
      "ore.gems.pools[1].slots[2] is another pool's slot",
      'ore.gems.pools[2].slots[0] must be rare or rarer',
      "ore.gems.pools[2].slots[1] is another pool's slot",
      'ore.gems.pools[2].slots must come from one kind table',
    ])
  })
})
