import { describe, expect, it } from 'vitest'
import { toCanonical } from '../money'
import { refusedOreRulesOfSave } from '../save/refusedOreRules'
import { fuelOf } from '../vehicle/vehicleFuel'
import { readMigratedSaveSlot } from '../save/saveMigrations'
import { readSaveSlot, saveSlotOf } from '../save/saveSlot'
import { chunkDigest } from '../world/chunkDigest'
import { generateChunk } from '../world/generateChunk'
import {
  GENERATED_POOLS_ORE_RULES,
  ORE_RULES_VERSION,
  planetParamsFor,
} from '../world/planetParams'
import type { AuthorityState } from './authorityState'
import { withAwayCoreBays, type AwayCoreBays } from './planetCoreBays'
import { planetParamsOf } from './planetOfState'
import {
  continueScriptedSession,
  createScriptedSession,
  typesOf,
  WORLD_SEED,
} from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stateDigest } from './stateDigest'

// The ore rules stamp of each planet (ticket 888, the TD's storage and test rows): stamped once at
// the first generation of (s, p), never migrated, kept for the planets the session has left and
// read back when it lands there again. `v_pre` is ore rules 13, the stamp before the generated
// pools; `v_new` is 14.

const V_PRE = GENERATED_POOLS_ORE_RULES - 1
const V_NEW = GENERATED_POOLS_ORE_RULES
/** Chunks across bands 1 to 5 and the core of a planet of a few hundred tiles. */
const CHUNKS = [
  [0, 0],
  [0, 2],
  [-3, 5],
  [7, -9],
  [12, 12],
  [-18, 3],
] as const

const setMoney = { type: 'debug.setMoney', payload: { amount: '1e30' } } as const
const dock = { type: 'dock', payload: { bay: 'sell' } } as const
const buyFuel = (units: number) => ({ type: 'buyFuel', payload: { units } }) as const
const jumpTo = (planet: string, system = '1') =>
  ({ type: 'jumpToPlanet', payload: { system, planet } }) as const
const throughJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** The chunks of the planet the state stands on, as one digest list. */
function digestsOf(state: AuthorityState): string[] {
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('no world')
  return CHUNKS.map(([cx, cy]) => chunkDigest(generateChunk(params, cx, cy)))
}

function digestsOfPlanet(planet: number, oreRulesVersion: number): string[] {
  const params = planetParamsFor(WORLD_SEED, planet, oreRulesVersion)
  return CHUNKS.map(([cx, cy]) => chunkDigest(generateChunk(params, cx, cy)))
}

/** The level-1 tank's capacity (`economy/fuelTank.ts`): every jump here burns at most that. */
const TANK_UNITS = 10

/** From `start`, docked with a full tank, a jump to `planet` of `system`; the events it answers. */
function jumpFrom(start: AuthorityState, planet: string, system = '1') {
  const session = continueScriptedSession(start)
  const tick = start.tick + 1
  session.submit(tick, setMoney)
  session.submit(tick, dock)
  const held = Math.floor(Number.parseFloat(toCanonical(fuelOf(session.vehicle()))))
  if (held < TANK_UNITS) session.submit(tick, buyFuel(TANK_UNITS - held))
  const events = session.submit(tick + 1, jumpTo(planet, system))
  return { state: session.state(), events }
}

function sessionOn(planet: number): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: planet } })
  return session.state()
}

/**
 * A save an older build wrote of `state` at snapshot 29: its planet under `stamp`, no left planet's
 * stamp (the field it never had) and `awayBays` as the left planets' core bays.
 */
function olderSaveOf(state: AuthorityState, stamp: number, awayBays: AwayCoreBays = {}): unknown {
  const { awayOreRules: _never, ...older } = state
  const planet = { ...state.planet, oreRulesVersion: stamp }
  const platform = withAwayCoreBays(state.platform, awayBays)
  const snapshot = takeSnapshot({ ...older, planet, platform })
  return throughJson(saveSlotOf({ ...snapshot, snapshotVersion: 29 }, 1))
}

function loaded(file: unknown): AuthorityState {
  const reading = readMigratedSaveSlot(file)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

describe('planet ore rules stamps (ticket 888)', () => {
  it('stamps a planet first generated from P6 with v_new and says planet_generated once', () => {
    const first = jumpFrom(sessionOn(5), '6')
    expect(first.state.planet.oreRulesVersion).toBe(V_NEW)
    expect(first.events.find((event) => event.type === 'PlanetGenerated')).toMatchObject({
      system: '1',
      place: '6',
      campaignIndex: '6',
      oreRulesVersion: V_NEW,
    })
    const away = jumpFrom(first.state, '5')
    const back = jumpFrom(away.state, '6')
    expect(typesOf(back.events)).not.toContain('PlanetGenerated')
    expect(back.state.planet.oreRulesVersion).toBe(V_NEW)
    expect(digestsOf(back.state)).toEqual(digestsOf(first.state))
  })

  it('keeps a left planet stamp under its s:p and takes it out on landing', () => {
    const onSix = jumpFrom(sessionOn(5), '6').state
    const onSeven = jumpFrom(onSix, '7').state
    expect(onSeven.awayOreRules).toEqual({ '1:1': 12, '1:5': 13, '1:6': V_NEW })
    const backOnSix = jumpFrom(onSeven, '6').state
    expect(backOnSix.awayOreRules).toEqual({ '1:1': 12, '1:5': 13, '1:7': V_NEW })
  })

  // TD test 2: an old save on P7 with P6 visited (its core bay banked) loads with no stamp for P6,
  // and both planets digest as pre-ticket-888 main made them.
  it('loads an old save with P6 and P7 visited on v_pre for both, as main made them', () => {
    const onSeven = sessionOn(7)
    const file = olderSaveOf(onSeven, V_PRE, { '1:6': { fragments: 4, isCompleted: false } })
    const state = loaded(file)
    expect(state.planet.oreRulesVersion).toBe(V_PRE)
    expect('awayOreRules' in state).toBe(false)
    expect(digestsOf(state)).toEqual(digestsOfPlanet(7, V_PRE))
    const onSix = jumpFrom(state, '6')
    expect(onSix.state.planet.oreRulesVersion).toBe(V_PRE)
    expect(typesOf(onSix.events)).not.toContain('PlanetGenerated')
    expect(digestsOf(onSix.state)).toEqual(digestsOfPlanet(6, V_PRE))
  })

  // TD tests 3 and 4: in a mixed save P6 stays v_pre and a newly entered P8 or P9 takes v_new, and
  // both are stable across save, reload and travel back.
  it('holds P6 on v_pre and a new P8 on v_new across save, reload and travel back', () => {
    const state = loaded(olderSaveOf(sessionOn(6), V_PRE))
    const onEight = jumpFrom(state, '8')
    expect(onEight.state.planet.oreRulesVersion).toBe(V_NEW)
    const reloaded = readSaveSlot(throughJson(saveSlotOf(takeSnapshot(onEight.state), 2)))
    if (!('state' in reloaded)) throw new Error(reloaded.problems.join('; '))
    expect(reloaded.state).toEqual(onEight.state)
    const onSix = jumpFrom(reloaded.state, '6').state
    expect(onSix.planet.oreRulesVersion).toBe(V_PRE)
    expect(digestsOf(onSix)).toEqual(digestsOfPlanet(6, V_PRE))
    const backOnEight = jumpFrom(onSix, '8').state
    expect(backOnEight.planet.oreRulesVersion).toBe(V_NEW)
    expect(digestsOf(backOnEight)).toEqual(digestsOf(onEight.state))
  })

  it('stamps an unvisited P9 of an old save with v_new, the same digest on every run', () => {
    const runs = [1, 2].map(() => jumpFrom(loaded(olderSaveOf(sessionOn(6), V_PRE)), '9'))
    expect(runs.map((run) => run.state.planet.oreRulesVersion)).toEqual([V_NEW, V_NEW])
    expect(typesOf(runs[0].events)).toContain('PlanetGenerated')
    expect(digestsOf(runs[0].state)).toEqual(digestsOf(runs[1].state))
    expect(digestsOf(runs[0].state)).not.toEqual(digestsOfPlanet(9, V_PRE))
  })

  // TD test 5: a stamp newer than this build is refused at load, never regenerated.
  it('refuses a save whose planet or left planet is stamped newer than this build', () => {
    const newer = ORE_RULES_VERSION + 1
    const onSix = jumpFrom(sessionOn(5), '6').state
    const snapshot = throughJson(takeSnapshot(onSix))
    const onNewer = {
      ...snapshot,
      state: { ...snapshot.state, planet: { ...snapshot.state.planet, oreRulesVersion: newer } },
    }
    expect(readSnapshot(onNewer).problems).toContain(
      'snapshot.state.planet.oreRulesVersion is not ore rules this build knows',
    )
    const leftNewer = { ...snapshot, state: { ...snapshot.state, awayOreRules: { '1:5': newer } } }
    expect(readSnapshot(leftNewer).problems).toContain(
      'snapshot.state.awayOreRules["1:5"] is not ore rules this build knows',
    )
    const saved = throughJson(saveSlotOf(takeSnapshot(onSix), 1))
    const world = { ...saved.world, oreRulesVersion: newer, awayOreRules: { '1:5': newer } }
    const file = { ...saved, world }
    expect(readMigratedSaveSlot(file)).toHaveProperty('problems')
    expect(refusedOreRulesOfSave(file)).toEqual([
      { system: '1', place: '6', oreRulesVersion: newer },
      { system: '1', place: '5', oreRulesVersion: newer },
    ])
  })

  // TD test 7: the stamps ride on the join snapshot, so a joining client generates the host's cells.
  it('gives the host and a joining client the same cells on a v_new planet', () => {
    const host = jumpFrom(jumpFrom(sessionOn(5), '6').state, '8').state
    const joined = readSnapshot(throughJson(takeSnapshot(host)))
    if (!('state' in joined)) throw new Error(joined.problems.join('; '))
    expect(stateDigest(joined.state)).toBe(stateDigest(host))
    expect(joined.state.awayOreRules).toEqual(host.awayOreRules)
    expect(digestsOf(joined.state)).toEqual(digestsOf(host))
    const hostBack = jumpFrom(host, '6').state
    const clientBack = jumpFrom(joined.state, '6').state
    expect(digestsOf(clientBack)).toEqual(digestsOf(hostBack))
  })

  it('stamps every planet of a later system with v_new on its first jump there', () => {
    const session = continueScriptedSession(sessionOn(5))
    session.submit(1, setMoney)
    session.submit(1, dock)
    session.submit(2, { type: 'buyJumpDrive', payload: {} })
    const jumped = jumpFrom(session.state(), '1', '2')
    expect(jumped.state.planet).toMatchObject({ index: 6, system: '2', oreRulesVersion: V_NEW })
    expect(jumped.events.find((event) => event.type === 'PlanetGenerated')).toMatchObject({
      system: '2',
      place: '1',
      campaignIndex: '6',
      oreRulesVersion: V_NEW,
    })
  })
})
