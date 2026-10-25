import { describe, expect, it } from 'vitest'
import {
  GENERATED_POOLS_ORE_RULES,
  ORE_RULES_VERSION,
  P1_GEMS_ORE_RULES,
  P2_OWN_KINDS_ORE_RULES,
  freshPlanetParamsFor,
  planetParamsFor,
} from '../../../systems/world/planetParams'
import { MAX_KIND_SLOT, NO_KIND_SLOT } from '../../../systems/world/worldCell'
import { ORE_ROWS } from '../../ores'
import {
  MIXED_ROSTER_ORE_RULES,
  planetRosterOf,
  poolOfPlanet,
  ROSTER_ORE_RULES,
  rosterKindOf,
} from './planetRoster'

// A planet's roster (TD ruling on ticket 446, section 2 and addendum 6226264758): the kind slots of
// its rarity row set, in table order, only on a planet entered under ore rules 2 or later; a pool's
// own slots only on that pool's planets from their ore rules on (P2's, ticket 709; P1's gems,
// ticket 713).

const SEED = 83921
const PLANETS_1_TO_200 = Array.from({ length: 200 }, (_, at) => at + 1)
/** The legacy slots P1 and P2 share, before the slots P2's pool owns (ticket 709). */
const SHARED_LEGACY = ORE_ROWS.kinds.slotsByTable.legacy.filter((slot) => slot.owner === undefined)
/** The legacy slots a pool owns, in table order. */
const ownSlotsOf = (pool: string) =>
  ORE_ROWS.kinds.slotsByTable.legacy.filter((slot) => slot.owner?.pool === pool)

describe('planet roster', () => {
  it('gives planets 1 and 2 Systems legacy table in its order, whatever the seed', () => {
    expect(planetRosterOf(freshPlanetParamsFor(SEED, 1)).slice(0, 12)).toEqual(SHARED_LEGACY)
    expect(planetRosterOf(freshPlanetParamsFor(7, 2)).slice(0, 12)).toEqual(SHARED_LEGACY)
  })

  it('gives a fresh planet 1 its three gems after the shared twelve, and none to an older one (ticket 713)', () => {
    const gemIds = planetRosterOf(freshPlanetParamsFor(7, 1))
      .slice(12)
      .map((slot) => slot.slotId)
    expect(gemIds).toEqual(['legacy.g1', 'legacy.g2', 'legacy.g3'])
    expect(planetRosterOf(planetParamsFor(SEED, 1, P1_GEMS_ORE_RULES - 1))).toEqual(SHARED_LEGACY)
  })

  it("gives a fresh planet 2 its pool's own three kinds after the shared twelve (ticket 709)", () => {
    const ownIds = planetRosterOf(freshPlanetParamsFor(7, 2))
      .slice(12)
      .map((slot) => slot.slotId)
    expect(ownIds).toEqual(['legacy.u5', 'legacy.r4', 'legacy.r5'])
    expect(planetRosterOf(freshPlanetParamsFor(SEED, 2))).toEqual([
      ...SHARED_LEGACY,
      ...ownSlotsOf('foothold-p2'),
    ])
  })

  it('keeps the shared twelve on a planet 2 a save holds under ore rules 8 (ticket 709)', () => {
    expect(planetRosterOf(planetParamsFor(SEED, 2, P2_OWN_KINDS_ORE_RULES - 1))).toEqual(
      SHARED_LEGACY,
    )
    expect(planetRosterOf(planetParamsFor(SEED, 1, ORE_RULES_VERSION))).toEqual([
      ...SHARED_LEGACY,
      ...ownSlotsOf('legacy'),
    ])
  })

  it('gives planets from 3 the mixed table', () => {
    expect(planetRosterOf(freshPlanetParamsFor(SEED, 3))).toEqual(ORE_ROWS.kinds.slotsByTable.mixed)
  })

  it('gives no roster to a planet a save holds unstamped or under ore rules 1', () => {
    expect(planetRosterOf(planetParamsFor(SEED, 1))).toEqual([])
    expect(planetRosterOf(planetParamsFor(SEED, 5, 1))).toEqual([])
  })

  it('keeps a planet from 3 a save holds under ore rules 2 or 3 kindless, the legacy planets rostered', () => {
    expect(MIXED_ROSTER_ORE_RULES).toBe(4)
    expect(planetRosterOf(planetParamsFor(SEED, 3, 2))).toEqual([])
    expect(planetRosterOf(planetParamsFor(SEED, 5, 3))).toEqual([])
    expect(planetRosterOf(planetParamsFor(SEED, 2, 2))).toEqual(SHARED_LEGACY)
  })

  it('gives no roster to a planet a save holds without a species pool, from planet 8 (#453)', () => {
    const rosters = [7, 8, 9, 60, 200].map((index) =>
      planetRosterOf(planetParamsFor(SEED, index, GENERATED_POOLS_ORE_RULES - 1)),
    )
    expect(rosters.map((roster) => roster.length > 0)).toEqual([
      ORE_ROWS.kinds.slotsByTable.mixed.length > 0,
      false,
      false,
      false,
      false,
    ])
  })

  it('is what this build stamps a fresh planet with', () => {
    expect(ORE_RULES_VERSION).toBeGreaterThanOrEqual(ROSTER_ORE_RULES)
  })

  it('holds at most rosterMaxKinds kinds on every planet, and fits the 8-bit kind slot', () => {
    const longest = Math.max(
      ...PLANETS_1_TO_200.map((index) => planetRosterOf(freshPlanetParamsFor(SEED, index)).length),
    )
    expect(longest).toBeLessThanOrEqual(ORE_ROWS.kinds.rosterMaxKinds)
    expect(ORE_ROWS.kinds.rosterMaxKinds).toBe(17)
    expect(ORE_ROWS.kinds.rosterMaxKinds).toBeLessThanOrEqual(MAX_KIND_SLOT)
  })

  it('reads a stored kind slot back as its roster entry, and none as null', () => {
    const params = freshPlanetParamsFor(SEED, 1)
    expect(rosterKindOf(params, 1)?.slotId).toBe('legacy.c1')
    expect(rosterKindOf(params, 12)?.slotId).toBe('legacy.r3')
    expect(rosterKindOf(params, 15)?.slotId).toBe('legacy.g3')
    expect(rosterKindOf(params, NO_KIND_SLOT)).toBeNull()
    expect(rosterKindOf(params, 16)).toBeNull()
  })

  it('picks the species pool from the planet index alone, whatever the seed', () => {
    const poolsOf = (seed: number) =>
      [1, 2, 3, 4, 5, 6, 7].map((index) => poolOfPlanet(freshPlanetParamsFor(seed, index)))
    expect(poolsOf(SEED)).toEqual(poolsOf(7))
    expect(new Set(poolsOf(SEED).slice(2, 5)).size).toBe(3)
  })

  it('gives no pool past planet 7 on a planet a save holds from before the generated pools', () => {
    const held = [8, 9, 41, 200].map((index) =>
      planetParamsFor(SEED, index, GENERATED_POOLS_ORE_RULES - 1),
    )
    expect(held.map(poolOfPlanet)).toEqual([null, null, null, null])
  })

  // Ticket 888: from ore rules 14 every planet after system 1's P5 draws its generated pool at its
  // address, so P6 to P200 all hold kinds and none of them reads foothold-p6-p7.
  it('resolves every fresh planet from P6 to its generated pool, system1-p<p>', () => {
    const fresh = [6, 7, 8, 9, 41, 200].map((index) => freshPlanetParamsFor(SEED, index))
    expect(fresh.map(poolOfPlanet)).toEqual([
      'system1-p6',
      'system1-p7',
      'system1-p8',
      'system1-p9',
      'system1-p41',
      'system1-p200',
    ])
    for (const params of fresh) {
      const roster = planetRosterOf(params)
      expect(roster.length).toBeGreaterThanOrEqual(15)
      expect(
        roster.every((slot) => slot.slotId.startsWith(`system1-p${params.planetIndex}-`)),
      ).toBe(true)
    }
  })

  it('keeps P1 to P5 on their authored pools under the generated pools rules', () => {
    const authored = [1, 2, 3, 4, 5].map((index) => poolOfPlanet(freshPlanetParamsFor(SEED, index)))
    expect(authored.every((pool) => pool !== null && !pool.startsWith('system'))).toBe(true)
  })
})
