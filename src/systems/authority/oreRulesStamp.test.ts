import { describe, expect, it } from 'vitest'
import { readMigratedSaveSlot } from '../save/saveMigrations'
import { readSaveSlot, saveSlotOf } from '../save/saveSlot'
import PLANET_5_SAVE from '../save/fixtures/pre-181-planet-5.save.json'
import { ORE_RULES_VERSION, planetParamsFor } from '../world/planetParams'
import { createAuthorityState, type AuthorityState } from './authorityState'
import { planetParamsOf } from './planetOfState'
import { continueScriptedSession, WORLD_SEED } from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'

// TD ruling on ticket 445, section 2: a planet entered from this build carries the ore rules it was
// entered under, from the first planet whose rows differ (planet 1 since the roster, ticket 446);
// one a save holds without them stays on the legacy rows until the player leaves it.

function sessionOn(planetIndex: number): AuthorityState {
  return createAuthorityState({ planetIndex, planetSeed: WORLD_SEED, playerIds: ['p1'] })
}

/** The pre-#181 save of planet 5: written before the ore rules, so its planet has no stamp. */
function legacyPlanet5(): AuthorityState {
  const reading = readMigratedSaveSlot(PLANET_5_SAVE)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

function onPlanet(state: AuthorityState, planetIndex: number): AuthorityState {
  const session = continueScriptedSession(state)
  session.submit(state.tick, { type: 'debug.setPlanet', payload: { planetIndex } })
  return session.state()
}

describe('ore rules stamp', () => {
  it('stamps a session on any planet: rules 2 on planet 1, the surface layer, 5, from 2', () => {
    const planets = [1, 2, 3, 10].map((index) => sessionOn(index).planet)
    expect(planets.map((planet) => planet.oreRulesVersion)).toEqual([2, 5, 5, 5])
    expect(ORE_RULES_VERSION).toBe(5)
  })

  it('keeps a planet a save holds without the stamp on the legacy rows', () => {
    const state = legacyPlanet5()
    expect(state.planet).toEqual({ index: 5, seed: WORLD_SEED })
    expect(planetParamsOf(state.planet)).toEqual(planetParamsFor(WORLD_SEED, 5))
  })

  it('stamps the next planet when a legacy one is left, planet 1 with the rules that change it', () => {
    const next = onPlanet(legacyPlanet5(), 6)
    expect(next.planet).toEqual({ index: 6, seed: WORLD_SEED, oreRulesVersion: ORE_RULES_VERSION })
    expect(onPlanet(next, 1).planet).toEqual({ index: 1, seed: WORLD_SEED, oreRulesVersion: 2 })
  })

  it('keeps a planet a save holds under ore rules 2 on the step bands (ticket 448)', () => {
    const atRulesTwo = {
      ...sessionOn(5),
      planet: { index: 5, seed: WORLD_SEED, oreRulesVersion: 2 },
    }
    const fromSave = readSaveSlot(
      JSON.parse(JSON.stringify(saveSlotOf(takeSnapshot(atRulesTwo), 1))),
    )
    expect('state' in fromSave && fromSave.state.planet.oreRulesVersion).toBe(2)
    expect(planetParamsOf(atRulesTwo.planet)?.patchLatticeDensityBp).toBeUndefined()
    expect(onPlanet(atRulesTwo, 6).planet.oreRulesVersion).toBe(ORE_RULES_VERSION)
  })

  it('keeps a planet a save holds under ore rules 1 on them, and stamps the next with this build', () => {
    const atRulesOne = {
      ...sessionOn(5),
      planet: { index: 5, seed: WORLD_SEED, oreRulesVersion: 1 },
    }
    const file = saveSlotOf(takeSnapshot(atRulesOne), 1)
    const fromSave = readSaveSlot(JSON.parse(JSON.stringify(file)))
    expect('state' in fromSave && fromSave.state.planet.oreRulesVersion).toBe(1)
    expect(onPlanet(atRulesOne, 6).planet.oreRulesVersion).toBe(ORE_RULES_VERSION)
  })

  it('carries a stamped planet through a snapshot and a save slot whole', () => {
    const state = sessionOn(3)
    const snapshot = takeSnapshot(state)
    const fromSnapshot = readSnapshot(JSON.parse(JSON.stringify(snapshot)))
    const fromSave = readSaveSlot(JSON.parse(JSON.stringify(saveSlotOf(snapshot, 1))))
    expect('state' in fromSnapshot && fromSnapshot.state.planet).toEqual(state.planet)
    expect(fromSave.problems).toEqual([])
    expect('state' in fromSave && fromSave.state.planet).toEqual(state.planet)
  })

  it('writes no stamp into the save of a legacy planet', () => {
    const file = saveSlotOf(takeSnapshot(legacyPlanet5()), 1)
    expect('oreRulesVersion' in file.world).toBe(false)
    expect(readSaveSlot(JSON.parse(JSON.stringify(file))).problems).toEqual([])
  })

  it('refuses a snapshot or a save that claims ore rules this build does not know', () => {
    const snapshot = takeSnapshot(sessionOn(3))
    const later = { ...snapshot.state.planet, oreRulesVersion: ORE_RULES_VERSION + 1 }
    const fromSnapshot = readSnapshot({ ...snapshot, state: { ...snapshot.state, planet: later } })
    const file = saveSlotOf(snapshot, 1)
    const fromSave = readSaveSlot({
      ...file,
      world: { ...file.world, oreRulesVersion: ORE_RULES_VERSION + 1 },
    })
    expect(fromSnapshot.problems).toEqual([
      'snapshot.state.planet.oreRulesVersion is not ore rules this build knows',
    ])
    expect(fromSave.problems).toContain(
      'save.world.params differ from the params this build generates for its seed and planet',
    )
  })
})
