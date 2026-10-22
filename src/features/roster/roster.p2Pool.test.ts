import { describe, expect, it } from 'vitest'
import { createAuthorityState, type AuthorityState } from '../../systems/authority/authorityState'
import { planetParamsOf } from '../../systems/authority/planetOfState'
import { takeSnapshot } from '../../systems/authority/sessionSnapshot'
import { readMigratedSaveSlot } from '../../systems/save/saveMigrations'
import { saveSlotOf } from '../../systems/save/saveSlot'
import {
  freshPlanetParamsFor,
  planetParamsFor,
  type PlanetParams,
} from '../../systems/world/planetParams'
import { NAMED_SEEDS, planetCellDigestOf } from './rosterFixtures'
import { planetRosterOf, poolOfPlanet } from './systems/planetRoster'
import { planetSpeciesOf } from './systems/planetSpecies'

// Ticket 632 (GD lock (b) on #595; HS, VS and G&V on #576): a fresh P2 shows its own species pool
// on the legacy kind slots under ore rules 6, while a P2 world a save already holds, entered under
// rules 5, loads on the legacy species and never re-rolls. The pool is look only: both read the
// same cells. One seed: a whole planet takes 2 to 4 s.

const SEED = NAMED_SEEDS[0]
const PLANET_TIMEOUT_MS = 120_000
/** The ore rules a P2 world was entered under before its own pool: the surface layer's. */
const RULES_BEFORE_P2_POOL = 5
/** P2's own pool; from rules 7 the registry radius changes its size too (ticket 643). */
const P2_POOL_RULES = 6

/** A save of P2 as main wrote it before ticket 632: stamped with ore rules 5. */
function savedOldPlanet2(): AuthorityState {
  const fresh = createAuthorityState({ planetIndex: 2, planetSeed: SEED, playerIds: ['p1'] })
  const old = { ...fresh, planet: { ...fresh.planet, oreRulesVersion: RULES_BEFORE_P2_POOL } }
  const reading = readMigratedSaveSlot(JSON.parse(JSON.stringify(saveSlotOf(takeSnapshot(old), 1))))
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

function speciesIdsOf(params: PlanetParams): (string | undefined)[] {
  return planetRosterOf(params).map((_, at) => planetSpeciesOf(params, at + 1)?.id)
}

/** A fresh P2 also swaps three slots' species under ore rules 9 (ticket 736), all of its own pool. */
function speciesPoolsOf(params: PlanetParams): (string | undefined)[] {
  return planetRosterOf(params).map((_, at) => planetSpeciesOf(params, at + 1)?.pool)
}

describe('planet 2 species pool', () => {
  const fresh = freshPlanetParamsFor(SEED, 2)
  const pooled = planetParamsFor(SEED, 2, P2_POOL_RULES)
  const saved = planetParamsOf(savedOldPlanet2().planet) as PlanetParams

  it('enters a fresh planet 2 on its own pool, one p2 species per legacy slot', () => {
    expect(fresh.oreRulesVersion).toBeGreaterThanOrEqual(P2_POOL_RULES)
    expect(poolOfPlanet(fresh)).toBe('foothold-p2')
    expect(speciesPoolsOf(fresh)).toEqual(planetRosterOf(fresh).map(() => 'foothold-p2'))
    expect(speciesIdsOf(pooled)).toEqual(
      planetRosterOf(pooled).map((slot) => `p2-${slot.slotId.replace('legacy.', '')}`),
    )
  })

  it('loads a planet 2 saved under ore rules 5 on the legacy species planet 1 shows', () => {
    expect(saved.oreRulesVersion).toBe(RULES_BEFORE_P2_POOL)
    expect(poolOfPlanet(saved)).toBe('legacy')
    expect(speciesIdsOf(saved)).toEqual(speciesIdsOf(freshPlanetParamsFor(SEED, 1)))
  })

  it(
    'reads the same cells on the saved planet 2 and one entered under its pool: the pool changes looks only',
    () => {
      expect(poolOfPlanet(pooled)).toBe('foothold-p2')
      expect(planetCellDigestOf(saved)).toBe(planetCellDigestOf(pooled))
    },
    PLANET_TIMEOUT_MS,
  )
})
