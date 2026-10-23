import { describe, expect, it } from 'vitest'
import {
  DEEP_RARE_WINDOW_ORE_RULES,
  ORE_RULES_VERSION,
  P2_OWN_KINDS_ORE_RULES,
} from '../../../systems/world/planetParams'
import economyFile from '../ores.economy.json'
import familiesFile from '../oreFamilies.json'
import { kindRowsOf, poolOfPlanetUnder, slotsOfPoolUnder } from './kindRows'
import { ORE_ROWS, oreRowProblems } from './oreRows'
import { isSlotLiveInBand, liveWindowOf } from './slotWindows'

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

const C1: Slot = economyFile.ore.kinds.legacy[0]

describe('ore kind slots', () => {
  it('ships Systems twelve shared legacy slots, 5 common, 4 uncommon and 3 rare', () => {
    const shared = ORE_ROWS.kinds.slotsByTable.legacy.filter((slot) => slot.owner === undefined)
    const count = (rarity: string) => shared.filter((slot) => slot.rarity === rarity).length
    expect(shared.map((slot) => slot.slotId)).toEqual([
      ...['c1', 'c2', 'c3', 'c4', 'c5', 'u1', 'u2', 'u3', 'u4', 'r1', 'r2', 'r3'].map(
        (name) => `legacy.${name}`,
      ),
    ])
    expect([count('common'), count('uncommon'), count('rare')]).toEqual([5, 4, 3])
  })

  it("appends P2's own three slots, a metal uncommon and two crystal rares in bands 4-5, from ore rules 9 (ticket 709)", () => {
    const own = ORE_ROWS.kinds.slotsByTable.legacy.slice(12)
    expect(own).toEqual(
      [
        ['legacy.u5', 'metal', 'uncommon'],
        ['legacy.r4', 'crystal', 'rare'],
        ['legacy.r5', 'crystal', 'rare'],
      ].map(([slotId, family, rarity]) => ({
        slotId,
        family,
        rarity,
        window: [4, 5],
        owner: { pool: 'foothold-p2', fromOreRules: P2_OWN_KINDS_ORE_RULES },
      })),
    )
  })

  it("ships Systems' mixed slots 4/3/3/3/2, then Option B's two fossil commons appended", () => {
    const mixed = ORE_ROWS.kinds.slotsByTable.mixed
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
    expect(ORE_ROWS.kinds.rosterMaxKinds).toBe(ORE_ROWS.kinds.slotsByTable.mixed.length)
  })

  it('keeps epic live from band 3 and mythic from band 4, the surface sparse (HS on #453)', () => {
    const firstBandOf = (rarity: string, rules: number) =>
      Math.min(
        ...ORE_ROWS.kinds.slotsByTable.mixed
          .filter((slot) => slot.rarity === rarity)
          .map((slot) => liveWindowOf(slot, rules)[0]),
      )
    const before = DEEP_RARE_WINDOW_ORE_RULES - 1
    expect(['rare', 'epic', 'mythic'].map((rarity) => firstBandOf(rarity, before))).toEqual([
      2, 3, 4,
    ])
  })

  it('moves the metal and crystal rares to band 3 from ore rules 11, d >= 0.35 (ticket 738)', () => {
    const rares = ORE_ROWS.kinds.slotsByTable.mixed.filter((slot) => slot.rarity === 'rare')
    const windowsUnder = (rules: number) => rares.map((slot) => liveWindowOf(slot, rules))
    expect(windowsUnder(DEEP_RARE_WINDOW_ORE_RULES - 1)).toEqual([
      [2, 5],
      [2, 5],
      [4, 4],
    ])
    expect(windowsUnder(DEEP_RARE_WINDOW_ORE_RULES)).toEqual([
      [3, 5],
      [3, 5],
      [4, 4],
    ])
    const deepFirstBands = ORE_ROWS.kinds.slotsByTable.mixed
      .filter((slot) => ['rare', 'epic', 'mythic'].includes(slot.rarity))
      .map((slot) => slot.window[0])
    expect(Math.min(...deepFirstBands)).toBe(3)
  })

  it('reads a slot live in the bands of its window only', () => {
    const [c3] = ORE_ROWS.kinds.slotsByTable.legacy.filter((slot) => slot.slotId === 'legacy.c3')
    expect([1, 2, 3, 4, 5].map((band) => isSlotLiveInBand(c3, band, ORE_RULES_VERSION))).toEqual([
      false,
      false,
      true,
      true,
      true,
    ])
  })

  it('refuses a table with more kinds than rosterMaxKinds', () => {
    expect(problemsWithLegacy(economyFile.ore.kinds.legacy, 14)).toEqual([
      'ore.kinds.legacy holds 15 kinds, over rosterMaxKinds',
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
})

// The pools a planet had under older ore rules (ticket 632, GD lock (b) on #595): a planet a save
// holds under rules older than its pool's keeps the pool it was entered with.
describe('ore kind pools before an ore rules version', () => {
  const EARLIER = { 3: { 2: 'older-p2' }, 5: { 2: 'legacy', 3: 'old-p3' } }
  const kinds = kindRowsOf(
    { ...economyFile.ore.kinds, poolsBeforeOreRules: EARLIER },
    ORE_ROWS.kinds.poolByPlanet,
  )
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
      'ore.kinds.poolsBeforeOreRules.3.9 names a planet with no pool',
    ])
    expect(problemsWithEarlierPools(['legacy'])).toEqual([
      'ore.kinds.poolsBeforeOreRules must map ore rules versions to planet pools',
    ])
  })
})

// A pool's own kind slots (ticket 709, GD ruling (A) on #709): a slot naming a pool and an ore rules
// version is drawn only by planets resolving to that pool under those rules or later, and sits after
// every shared slot, so leaving it out never moves a shared slot's roster index.
describe("a pool's own kind slots", () => {
  const OWN = { ...C1, slotId: 'legacy.u9', pool: 'foothold-p2', fromOreRules: 2 }
  const shared = economyFile.ore.kinds.legacy.filter((slot) => !('pool' in slot))
  const kinds = kindRowsOf(
    { ...economyFile.ore.kinds, legacy: [...shared, OWN] },
    ORE_ROWS.kinds.poolByPlanet,
  )
  const idsOf = (pool: string, rules: number | undefined) =>
    slotsOfPoolUnder(kinds, 'legacy', pool, rules).map((slot) => slot.slotId)
  const sharedIds = shared.map((slot) => slot.slotId)

  it('gives the own slot to its pool from its ore rules on, after every shared slot', () => {
    expect(idsOf('foothold-p2', 2)).toEqual([...sharedIds, 'legacy.u9'])
    expect(idsOf('foothold-p2', ORE_RULES_VERSION)).toEqual([...sharedIds, 'legacy.u9'])
  })

  it('keeps the own slot from another pool and from a stamp older than its rules', () => {
    expect(idsOf('legacy', ORE_RULES_VERSION)).toEqual(sharedIds)
    expect(idsOf('foothold-p2', 1)).toEqual(sharedIds)
    expect(idsOf('foothold-p2', undefined)).toEqual(sharedIds)
  })

  it('refuses an own slot naming no registry pool or an ore rules version this build does not know', () => {
    expect(
      problemsWithLegacy([
        ...shared,
        { ...OWN, pool: 'foothold-p99' },
        { ...OWN, slotId: 'legacy.u8', fromOreRules: ORE_RULES_VERSION + 1 },
        { ...C1, slotId: 'legacy.u7', fromOreRules: 2 },
      ]),
    ).toEqual([
      `ore.kinds.legacy[${shared.length}].pool must name a registry pool`,
      `ore.kinds.legacy[${shared.length + 1}].fromOreRules must be an ore rules version from 2 to ${ORE_RULES_VERSION}`,
      `ore.kinds.legacy[${shared.length + 2}].pool must name a registry pool`,
    ])
  })

  it('refuses a shared slot after an own slot', () => {
    const [first, ...rest] = shared
    expect(problemsWithLegacy([...rest, OWN, { ...first }])).toEqual([
      `ore.kinds.legacy[${shared.length}] is shared but follows a pool's own slot`,
    ])
  })
})

// A slot's window by ore rules (ticket 738): a window may narrow at an ore rules version, and a
// planet stamped before it keeps the window it was entered with, so its chunks never seam.
describe('a kind slot window narrowed at an ore rules version', () => {
  const R1 = economyFile.ore.kinds.legacy.find((slot) => slot.slotId === 'legacy.r1') as Slot
  const NARROWED = {
    ...R1,
    slotId: 'legacy.r8',
    window: [4, 5],
    windowsBeforeOreRules: { 5: [3, 5] },
  }
  const shared = economyFile.ore.kinds.legacy.filter((slot) => !('pool' in slot))
  const kinds = kindRowsOf(
    { ...economyFile.ore.kinds, legacy: [...shared, NARROWED] },
    ORE_ROWS.kinds.poolByPlanet,
  )
  const narrowed = kinds.slotsByTable.legacy[shared.length]

  it('keeps the earlier window on a planet stamped before the version, and the newest from it on', () => {
    const windows = [undefined, 2, 4, 5, ORE_RULES_VERSION].map((rules) =>
      liveWindowOf(narrowed, rules),
    )
    expect(windows).toEqual([
      [3, 5],
      [3, 5],
      [3, 5],
      [4, 5],
      [4, 5],
    ])
    expect(isSlotLiveInBand(narrowed, 3, 4)).toBe(true)
    expect(isSlotLiveInBand(narrowed, 3, 5)).toBe(false)
  })

  it('reads a slot whose window never moved the same under every stamp', () => {
    const [c3] = ORE_ROWS.kinds.slotsByTable.legacy.filter((slot) => slot.slotId === 'legacy.c3')
    expect([undefined, 2, ORE_RULES_VERSION].map((rules) => liveWindowOf(c3, rules))).toEqual([
      [3, 5],
      [3, 5],
      [3, 5],
    ])
  })

  it('refuses an earlier window live where its tier weighs nothing, as the newest is refused', () => {
    expect(
      problemsWithLegacy([...shared, { ...NARROWED, windowsBeforeOreRules: { 5: [2, 5] } }]),
    ).toEqual([
      `ore.kinds.legacy[${shared.length}] is live in band 2, where legacy rare weighs nothing`,
    ])
  })

  it('refuses a mixed rare left live in band 2 for the deep rows, which draw it from band 3', () => {
    const mixed = economyFile.ore.kinds.mixed.map((slot) =>
      slot.slotId === 'mixed.r1'
        ? { ...slot, window: [2, 5], windowsBeforeOreRules: undefined }
        : slot,
    )
    const kinds = { ...economyFile.ore.kinds, mixed }
    expect(oreRowProblems({ ore: { ...economyFile.ore, kinds } }, familiesFile)).toEqual([
      'ore.kinds.mixed[7] is live in band 2, where deep rare weighs nothing',
    ])
  })

  it('refuses an ore rules version this build does not know and a window outside the bands', () => {
    const broken = { ...NARROWED, windowsBeforeOreRules: { 1: [3, 5], 4: [0, 5] } }
    expect(problemsWithLegacy([...shared, broken])).toEqual([
      `ore.kinds.legacy[${shared.length}].windowsBeforeOreRules.1 must be an ore rules version from 2 to ${ORE_RULES_VERSION}`,
      `ore.kinds.legacy[${shared.length}].windowsBeforeOreRules.4 must be [first, last] in 1..5`,
    ])
    expect(
      problemsWithLegacy([...shared, { ...NARROWED, windowsBeforeOreRules: [[3, 5]] }]),
    ).toEqual([
      `ore.kinds.legacy[${shared.length}].windowsBeforeOreRules must map ore rules versions to band windows`,
    ])
  })
})
