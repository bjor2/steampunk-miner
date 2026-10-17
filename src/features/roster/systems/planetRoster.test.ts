import { describe, expect, it } from 'vitest'
import {
  ORE_RULES_VERSION,
  freshPlanetParamsFor,
  planetParamsFor,
} from '../../../systems/world/planetParams'
import { MAX_KIND_SLOT, NO_KIND_SLOT } from '../../../systems/world/worldCell'
import { ORE_ROWS } from '../../ores'
import { planetRosterOf, ROSTER_ORE_RULES, rosterKindOf } from './planetRoster'

// A planet's roster (TD ruling on ticket 446, section 2 and addendum 6226264758): the kind slots of
// its rarity row set, in table order, only on a planet entered under ore rules 2 or later.

const SEED = 83921
const PLANETS_1_TO_200 = Array.from({ length: 200 }, (_, at) => at + 1)

describe('planet roster', () => {
  it('gives planets 1 and 2 Systems legacy table in its order, whatever the seed', () => {
    const legacy = ORE_ROWS.kinds.slotsBySet.legacy
    expect(planetRosterOf(freshPlanetParamsFor(SEED, 1))).toEqual(legacy)
    expect(planetRosterOf(freshPlanetParamsFor(7, 2))).toEqual(legacy)
  })

  it('gives planets from 3 the mixed table', () => {
    expect(planetRosterOf(freshPlanetParamsFor(SEED, 3))).toEqual(ORE_ROWS.kinds.slotsBySet.mixed)
  })

  it('gives no roster to a planet a save holds unstamped or under ore rules 1', () => {
    expect(planetRosterOf(planetParamsFor(SEED, 1))).toEqual([])
    expect(planetRosterOf(planetParamsFor(SEED, 5, 1))).toEqual([])
  })

  it('is what this build stamps a fresh planet with', () => {
    expect(ORE_RULES_VERSION).toBeGreaterThanOrEqual(ROSTER_ORE_RULES)
  })

  it('holds at most rosterMaxKinds kinds on every planet, and fits the 8-bit kind slot', () => {
    const longest = Math.max(
      ...PLANETS_1_TO_200.map((index) => planetRosterOf(freshPlanetParamsFor(SEED, index)).length),
    )
    expect(longest).toBeLessThanOrEqual(ORE_ROWS.kinds.rosterMaxKinds)
    expect(ORE_ROWS.kinds.rosterMaxKinds).toBe(15)
    expect(ORE_ROWS.kinds.rosterMaxKinds).toBeLessThanOrEqual(MAX_KIND_SLOT)
  })

  it('reads a stored kind slot back as its roster entry, and none as null', () => {
    const params = freshPlanetParamsFor(SEED, 1)
    expect(rosterKindOf(params, 1)?.slotId).toBe('legacy.c1')
    expect(rosterKindOf(params, 12)?.slotId).toBe('legacy.r3')
    expect(rosterKindOf(params, NO_KIND_SLOT)).toBeNull()
    expect(rosterKindOf(params, 13)).toBeNull()
  })
})
