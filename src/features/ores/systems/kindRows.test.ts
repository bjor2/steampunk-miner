import { describe, expect, it } from 'vitest'
import { ORE_RULES_VERSION } from '../../../systems/world/planetParams'
import economyFile from '../ores.economy.json'
import familiesFile from '../oreFamilies.json'
import { isSlotLiveInBand, kindRowsOf, poolOfPlanetUnder } from './kindRows'
import { ORE_ROWS, oreRowProblems } from './oreRows'

// The kind slot tables (TD ruling on ticket 446, addendum 6226264758; Systems' kinds.legacy,
// 6226282340, and kinds.mixed on #453, 6235087481 with Option B): the economy side of a material
// kind, refused whole when a slot breaks a rule.

type Slot = (typeof economyFile.ore.kinds.legacy)[number]

/** The shipped files with the legacy table and the cap replaced. */
function problemsWithLegacy(
  legacy: readonly unknown[],
  rosterMaxKinds = economyFile.ore.kinds.rosterMaxKinds,
): string[] {
  const kinds = { ...economyFile.ore.kinds, rosterMaxKinds, legacy }
  return oreRowProblems({ ore: { ...economyFile.ore, kinds } }, familiesFile)
}

/** The shipped files with the earlier pools table replaced. */
function problemsWithEarlierPools(poolsBeforeOreRules: unknown): string[] {
  const kinds = { ...economyFile.ore.kinds, poolsBeforeOreRules }
  return oreRowProblems({ ore: { ...economyFile.ore, kinds } }, familiesFile)
}

/** The shipped files with the planet-to-pool table replaced, and no earlier pools to name it. */
function problemsWithPools(pools: unknown): string[] {
  const kinds = { ...economyFile.ore.kinds, pools, poolsBeforeOreRules: undefined }
  return oreRowProblems({ ore: { ...economyFile.ore, kinds } }, familiesFile)
}

const C1: Slot = economyFile.ore.kinds.legacy[0]

describe('ore kind slots', () => {
  it('ships Systems twelve legacy slots, 5 common, 4 uncommon and 3 rare', () => {
    const legacy = ORE_ROWS.kinds.slotsBySet.legacy
    const count = (rarity: string) => legacy.filter((slot) => slot.rarity === rarity).length
    expect(legacy.map((slot) => slot.slotId)).toEqual([
      ...['c1', 'c2', 'c3', 'c4', 'c5', 'u1', 'u2', 'u3', 'u4', 'r1', 'r2', 'r3'].map(
        (name) => `legacy.${name}`,
      ),
    ])
    expect([count('common'), count('uncommon'), count('rare')]).toEqual([5, 4, 3])
  })

  it("ships Systems' mixed slots 4/3/3/3/2, then Option B's two fossil commons appended", () => {
    const mixed = ORE_ROWS.kinds.slotsBySet.mixed
    const names = ['c1', 'c2', 'c3', 'c4', 'u1', 'u2', 'u3', 'r1', 'r2', 'r3', 'e1', 'e2', 'e3']
    expect(mixed.map((slot) => slot.slotId)).toEqual(
      [...names, 'm1', 'm2', 'c5', 'c6'].map((name) => `mixed.${name}`),
    )
    const count = (rarity: string) => mixed.filter((slot) => slot.rarity === rarity).length
    expect(['common', 'uncommon', 'rare', 'epic', 'mythic'].map(count)).toEqual([6, 3, 3, 3, 2])
    expect(mixed.slice(-2).map(({ family, rarity, window }) => [family, rarity, window])).toEqual([
      ['fossil', 'common', [3, 3]],
      ['fossil', 'common', [3, 3]],
    ])
  })

  it('caps a roster at the mixed table with its appended rows, 17, inside the 8-bit slot', () => {
    expect(ORE_ROWS.kinds.rosterMaxKinds).toBe(17)
    expect(ORE_ROWS.kinds.rosterMaxKinds).toBe(ORE_ROWS.kinds.slotsBySet.mixed.length)
  })

  it('keeps epic live from band 3 and mythic from band 4, the surface sparse (HS on #453)', () => {
    const firstBandOf = (rarity: string) =>
      Math.min(
        ...ORE_ROWS.kinds.slotsBySet.mixed
          .filter((slot) => slot.rarity === rarity)
          .map((slot) => slot.window[0]),
      )
    expect(['rare', 'epic', 'mythic'].map(firstBandOf)).toEqual([2, 3, 4])
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
      'ore.kinds.mixed holds 17 kinds, over rosterMaxKinds',
    ])
    expect(problemsWithLegacy(economyFile.ore.kinds.legacy, 15)).toEqual([
      'ore.kinds.mixed holds 17 kinds, over rosterMaxKinds',
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

  it('keeps planet 1 on the legacy pool and gives P2, P3, P4 and P5 a pool each', () => {
    expect([1, 2, 3, 4, 5].map(poolOf)).toEqual([
      'legacy',
      'foothold-p2',
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

// The pools a planet had under older ore rules (ticket 632, GD lock (b) on #595): a planet a save
// holds under rules older than its pool's keeps the pool it was entered with.
describe('ore kind pools before an ore rules version', () => {
  const EARLIER = { 3: { 2: 'older-p2' }, 5: { 2: 'legacy', 3: 'old-p3' } }
  const kinds = kindRowsOf({ ...economyFile.ore.kinds, poolsBeforeOreRules: EARLIER })
  const today = (planet: number) => kinds.poolByPlanet.get(planet)

  it('resolves a stamp to the pool of the earliest rules it predates, and from them on to today', () => {
    expect([undefined, 1, 2, 3, 4, 5].map((rules) => poolOfPlanetUnder(kinds, 2, rules))).toEqual([
      'older-p2',
      'older-p2',
      'older-p2',
      'legacy',
      'legacy',
      today(2),
    ])
    expect([4, 5].map((rules) => poolOfPlanetUnder(kinds, 3, rules))).toEqual(['old-p3', today(3)])
  })

  it('keeps planet 2 as a save holds it under ore rules 5 or earlier on the legacy pool', () => {
    const poolsOfP2 = [undefined, 2, 5, 6].map((rules) =>
      poolOfPlanetUnder(ORE_ROWS.kinds, 2, rules),
    )
    expect(poolsOfP2).toEqual(['legacy', 'legacy', 'legacy', 'foothold-p2'])
    expect(poolOfPlanetUnder(ORE_ROWS.kinds, 1, 2)).toBe('legacy')
  })

  it('leaves a planet the table does not name on its pool, and none past the pools table', () => {
    expect(poolOfPlanetUnder(kinds, 4, 1)).toBe(today(4))
    expect(poolOfPlanetUnder(kinds, 8, 1)).toBeNull()
  })

  it('refuses a version this build does not know, an unnamed planet and a pool id not kebab-case', () => {
    expect(problemsWithEarlierPools({ 1: { 2: 'legacy' }, 99: { 2: 'legacy' } })).toEqual([
      `ore.kinds.poolsBeforeOreRules.1 must be an ore rules version from 2 to ${ORE_RULES_VERSION}`,
      `ore.kinds.poolsBeforeOreRules.99 must be an ore rules version from 2 to ${ORE_RULES_VERSION}`,
    ])
    expect(problemsWithEarlierPools({ 3: { 9: 'legacy', 2: 'Old P2' } })).toEqual([
      'ore.kinds.poolsBeforeOreRules.3.2 must be a kebab-case pool id',
      'ore.kinds.poolsBeforeOreRules.3.9 names a planet pools does not',
    ])
    expect(problemsWithEarlierPools(['legacy'])).toEqual([
      'ore.kinds.poolsBeforeOreRules must map ore rules versions to planet pools',
    ])
  })
})
