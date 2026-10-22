import { describe, expect, it } from 'vitest'
import {
  ORE_RULES_VERSION,
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
// own slots only on that pool's planets from their ore rules on (ticket 709).

const SEED = 83921
const PLANETS_1_TO_200 = Array.from({ length: 200 }, (_, at) => at + 1)
/** The legacy slots P1 and P2 share, before the slots P2's pool owns (ticket 709). */
const SHARED_LEGACY = ORE_ROWS.kinds.slotsBySet.legacy.filter((slot) => slot.owner === undefined)

describe('planet roster', () => {
  it('gives planets 1 and 2 Systems legacy table in its order, whatever the seed', () => {
    expect(planetRosterOf(freshPlanetParamsFor(SEED, 1))).toEqual(SHARED_LEGACY)
    expect(planetRosterOf(freshPlanetParamsFor(7, 2)).slice(0, 12)).toEqual(SHARED_LEGACY)
  })

  it("gives a fresh planet 2 its pool's own three kinds after the shared twelve (ticket 709)", () => {
    const ownIds = planetRosterOf(freshPlanetParamsFor(7, 2))
      .slice(12)
      .map((slot) => slot.slotId)
    expect(ownIds).toEqual(['legacy.u5', 'legacy.r4', 'legacy.r5'])
    expect(planetRosterOf(freshPlanetParamsFor(SEED, 2))).toEqual(ORE_ROWS.kinds.slotsBySet.legacy)
  })

  it('keeps the shared twelve on a planet 2 a save holds under ore rules 8 (ticket 709)', () => {
    expect(planetRosterOf(planetParamsFor(SEED, 2, P2_OWN_KINDS_ORE_RULES - 1))).toEqual(
      SHARED_LEGACY,
    )
    expect(planetRosterOf(planetParamsFor(SEED, 1, ORE_RULES_VERSION))).toEqual(SHARED_LEGACY)
  })

  it('gives planets from 3 the mixed table', () => {
    expect(planetRosterOf(freshPlanetParamsFor(SEED, 3))).toEqual(ORE_ROWS.kinds.slotsBySet.mixed)
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

  it('gives no roster to a planet without a species pool, from planet 8 (#453)', () => {
    const rosters = [7, 8, 9, 60, 200].map((index) =>
      planetRosterOf(freshPlanetParamsFor(SEED, index)),
    )
    expect(rosters.map((roster) => roster.length > 0)).toEqual([
      ORE_ROWS.kinds.slotsBySet.mixed.length > 0,
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
    expect(rosterKindOf(params, NO_KIND_SLOT)).toBeNull()
    expect(rosterKindOf(params, 13)).toBeNull()
  })

  it('picks the species pool from the planet index alone, whatever the seed', () => {
    const poolsOf = (seed: number) =>
      [1, 2, 3, 4, 5, 6, 7].map((index) => poolOfPlanet(freshPlanetParamsFor(seed, index)))
    expect(poolsOf(SEED)).toEqual(poolsOf(7))
    expect(new Set(poolsOf(SEED).slice(2, 5)).size).toBe(3)
  })

  it('gives no pool past planet 7, so a slot there binds no species', () => {
    expect([8, 9, 41, 200].map((index) => poolOfPlanet(freshPlanetParamsFor(SEED, index)))).toEqual(
      [null, null, null, null],
    )
  })
})
