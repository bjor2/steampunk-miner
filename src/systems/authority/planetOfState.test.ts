import { describe, expect, it } from 'vitest'
import { ORE_RULES_VERSION, planetParamsFor } from '../world/planetParams'
import { planetEntryOf } from './planetEntry'
import { planetParamsOf, withOreRulesVersion } from './planetOfState'

// TD ruling on ticket 445, section 2: the ore rules a planet was entered under are an input of its
// params, so the one-slot params cache keys on them and `planet_entered` names them.

const SEED = 83921

describe('session planet params', () => {
  it('gives a legacy and a stamped planet of one seed and index their own params', () => {
    const legacy = planetParamsOf({ index: 3, seed: SEED })
    const stamped = planetParamsOf({ index: 3, seed: SEED, oreRulesVersion: ORE_RULES_VERSION })
    expect(legacy?.oreRulesVersion).toBeUndefined()
    expect(stamped?.oreRulesVersion).toBe(ORE_RULES_VERSION)
    expect(planetParamsOf({ index: 3, seed: SEED })).toEqual(planetParamsFor(SEED, 3))
  })

  it('has no world for ore rules this build does not know', () => {
    expect(planetParamsOf({ index: 3, seed: SEED, oreRulesVersion: ORE_RULES_VERSION + 1 })).toBe(
      null,
    )
  })

  it('writes the stamp under its key only when there is one', () => {
    expect(withOreRulesVersion({ index: 4, seed: SEED }, undefined)).toEqual({
      index: 4,
      seed: SEED,
    })
    expect('oreRulesVersion' in withOreRulesVersion({ index: 4, seed: SEED }, undefined)).toBe(
      false,
    )
    expect(withOreRulesVersion({ index: 4, seed: SEED }, 1)).toEqual({
      index: 4,
      seed: SEED,
      oreRulesVersion: 1,
    })
  })

  it('names the ore rules on planet_entered only for a stamped planet', () => {
    const stamped = planetEntryOf(planetParamsFor(SEED, 3, ORE_RULES_VERSION))
    const legacy = planetEntryOf(planetParamsFor(SEED, 3))
    expect(stamped.oreRulesVersion).toBe(ORE_RULES_VERSION)
    expect('oreRulesVersion' in legacy).toBe(false)
  })
})
