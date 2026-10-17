import { describe, expect, it } from 'vitest'
import economyFile from '../ores.economy.json'
import familiesFile from '../oreFamilies.json'
import { isSlotLiveInBand } from './kindRows'
import { ORE_ROWS, oreRowProblems } from './oreRows'

// The kind slot tables (TD ruling on ticket 446, addendum 6226264758; Systems' kinds.legacy,
// 6226282340): the economy side of a material kind, refused whole when a slot breaks a rule.

type Slot = (typeof economyFile.ore.kinds.legacy)[number]

/** The shipped files with the legacy table and the cap replaced. */
function problemsWithLegacy(legacy: readonly unknown[], rosterMaxKinds = 15): string[] {
  const kinds = { ...economyFile.ore.kinds, rosterMaxKinds, legacy }
  return oreRowProblems({ ore: { ...economyFile.ore, kinds } }, familiesFile)
}

/** The shipped files with the planet-to-pool table replaced. */
function problemsWithPools(pools: unknown): string[] {
  const kinds = { ...economyFile.ore.kinds, pools }
  return oreRowProblems({ ore: { ...economyFile.ore, kinds } }, familiesFile)
}

const C1: Slot = economyFile.ore.kinds.legacy[0]

describe('ore kind slots', () => {
  it('ships Systems twelve legacy slots, 5 common, 4 uncommon and 3 rare, under the cap of 15', () => {
    const legacy = ORE_ROWS.kinds.slotsBySet.legacy
    const count = (rarity: string) => legacy.filter((slot) => slot.rarity === rarity).length
    expect(legacy.map((slot) => slot.slotId)).toEqual([
      ...['c1', 'c2', 'c3', 'c4', 'c5', 'u1', 'u2', 'u3', 'u4', 'r1', 'r2', 'r3'].map(
        (name) => `legacy.${name}`,
      ),
    ])
    expect([count('common'), count('uncommon'), count('rare')]).toEqual([5, 4, 3])
    expect(ORE_ROWS.kinds.rosterMaxKinds).toBe(15)
  })

  it('reads a slot live in the bands of its window only', () => {
    const [c3] = ORE_ROWS.kinds.slotsBySet.legacy.filter((slot) => slot.slotId === 'legacy.c3')
    expect([1, 2, 3, 4, 5].map((band) => isSlotLiveInBand(c3, band))).toEqual([
      false,
      false,
      true,
      true,
      true,
    ])
  })

  it('refuses a table with more kinds than rosterMaxKinds', () => {
    expect(problemsWithLegacy(economyFile.ore.kinds.legacy, 11)).toEqual([
      'ore.kinds.legacy holds 12 kinds, over rosterMaxKinds',
    ])
  })

  it('refuses a kind live in a band where its tier weighs nothing', () => {
    const early = { ...C1, slotId: 'legacy.r9', rarity: 'rare', window: [2, 3] }
    expect(problemsWithLegacy([early])).toEqual([
      'ore.kinds.legacy[0] is live in band 2, where legacy rare weighs nothing',
    ])
  })

  it('refuses an unknown family, rarity, window or slot id, and a slot listed twice', () => {
    expect(
      problemsWithLegacy([
        { ...C1, family: 'brass' },
        { ...C1, rarity: 'legendary' },
        { ...C1, window: [4, 2] },
        { ...C1, slotId: 'mixed.c1' },
        C1,
      ]),
    ).toEqual([
      'ore.kinds.legacy[0].family must name an ore family',
      'ore.kinds.legacy[1].rarity must name a rarity tier',
      'ore.kinds.legacy[2].window must be [first, last] in 1..5',
      'ore.kinds.legacy[3].slotId must be "legacy.<name>"',
      'kind slot "legacy.c1" twice',
    ])
  })
})

// The planet-picks-pool seam (TD shape on ticket 542, #453 comment 6236465674): which species pool
// a planet's shared kind slots resolve to, by planet index alone.
describe('ore kind pools', () => {
  const poolOf = (planet: number) => ORE_ROWS.kinds.poolByPlanet.get(planet)

  it('keeps planets 1 and 2 on the legacy pool and gives P3, P4 and P5 a pool each', () => {
    expect([1, 2, 3, 4, 5].map(poolOf)).toEqual([
      'legacy',
      'legacy',
      'foothold-p3',
      'foothold-p4',
      'foothold-p5',
    ])
  })

  it('maps planets 6 and 7 to one named pool and nothing past planet 7', () => {
    expect(poolOf(6)).toBe('foothold-p6-p7')
    expect(poolOf(7)).toBe('foothold-p6-p7')
    expect([8, 9, 40, 200].map(poolOf)).toEqual([undefined, undefined, undefined, undefined])
  })

  it('refuses a table that skips a planet or does not start at planet 1', () => {
    const gap = 'ore.kinds.pools must name planets 1 to n, with no gap'
    expect(problemsWithPools({ 1: 'legacy', 3: 'foothold-p3' })).toEqual([gap])
    expect(problemsWithPools({ 2: 'legacy' })).toEqual([gap])
    expect(problemsWithPools({})).toEqual([gap])
  })

  it('refuses a pool id that is not kebab-case, and a table that is not a map', () => {
    expect(problemsWithPools({ 1: 'legacy', 2: 'Foothold.P3' })).toEqual([
      'ore.kinds.pools.2 must be a kebab-case pool id',
    ])
    expect(problemsWithPools(['legacy'])).toEqual([
      'ore.kinds.pools must map planet indices to pool ids',
    ])
  })
})
