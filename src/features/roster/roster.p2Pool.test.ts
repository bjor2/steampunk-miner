import { describe, expect, it } from 'vitest'
import { createAuthorityState, type AuthorityState } from '../../systems/authority/authorityState'
import { planetParamsOf } from '../../systems/authority/planetOfState'
import { takeSnapshot } from '../../systems/authority/sessionSnapshot'
import { readMigratedSaveSlot } from '../../systems/save/saveMigrations'
import { saveSlotOf } from '../../systems/save/saveSlot'
import { freshPlanetParamsFor, type PlanetParams } from '../../systems/world/planetParams'
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

describe('planet 2 species pool', () => {
  const fresh = freshPlanetParamsFor(SEED, 2)
  const saved = planetParamsOf(savedOldPlanet2().planet) as PlanetParams

  it('enters a fresh planet 2 on its own pool, one p2 species per legacy slot', () => {
    expect(fresh.oreRulesVersion).toBe(6)
    expect(poolOfPlanet(fresh)).toBe('foothold-p2')
    expect(speciesIdsOf(fresh)).toEqual(
      planetRosterOf(fresh).map((slot) => `p2-${slot.slotId.replace('legacy.', '')}`),
    )
  })

  it('loads a planet 2 saved under ore rules 5 on the legacy species planet 1 shows', () => {
    expect(saved.oreRulesVersion).toBe(RULES_BEFORE_P2_POOL)
    expect(poolOfPlanet(saved)).toBe('legacy')
    expect(speciesIdsOf(saved)).toEqual(speciesIdsOf(freshPlanetParamsFor(SEED, 1)))
  })

  it(
    'reads the same cells on the saved and the fresh planet 2: the pool changes looks only',
    () => {
      expect(planetCellDigestOf(saved)).toBe(planetCellDigestOf(fresh))
    },
    PLANET_TIMEOUT_MS,
  )
})
