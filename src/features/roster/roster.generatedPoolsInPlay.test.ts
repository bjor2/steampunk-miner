import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../systems/authority/authorityState'
import { planetParamsOf } from '../../systems/authority/planetOfState'
import {
  continueScriptedSession,
  createScriptedSession,
  FREEZE_ENEMIES,
  mineTile,
  surfaceOreTiles,
  typesOf,
} from '../../systems/authority/scriptedSession'
import { onCurveStep } from '../../systems/economy/vehicleStats'
import { hasDiscovered, type DiscoveryFallback } from '../../systems/registries/discovery'
import { placeOfCampaign } from '../../systems/starMap/campaignIndex'
import { systemOfParams } from '../../systems/starMap/systemPlanetParams'
import { kindSlotOfCell } from '../../systems/world/worldCell'
import { cellAt } from '../../systems/world/worldState'
import type { TilePoint } from '../../systems/world/tileGrid'
import { materialPoolAt } from '../solar-systems'
import { planetSpeciesOf } from './systems/planetSpecies'

// The GD's in-play row on ticket 888: a vehicle actually digs cells on system 1's P6, P8 and P40
// and on system 2's planets 1 and 3, and every species the dug cells wear, as the codex records
// them on contact, is a kind of that planet's generated pool at its address. A generator-only read
// would not show the binding reaches the ground the player drills.

const NEVER_MET: DiscoveryFallback = {
  progress: {
    highestPlanetIndex: 0,
    collectedArtefactRowIds: new Set(),
    builtFacilityRowIds: new Set(),
    manualUnlockRowIds: new Set(),
  },
  unlockPlanetIndex: Number.POSITIVE_INFINITY,
}
const DUG_PER_PLANET = 3
/** Planets of drill and tip ahead of the planet, so a level-0 bite is never what stops the dig. */
const DRILL_LEAD_PLANETS = 6
const money = { type: 'debug.setMoney', payload: { amount: '1e30' } } as const
const dock = { type: 'dock', payload: { bay: 'sell' } } as const
const jumpTo = (system: string, planet: string) =>
  ({ type: 'jumpToPlanet', payload: { system, planet } }) as const

/** A session docked on system 1's planet `planet`, enemies frozen. */
function onFirstSystemPlanet(planet: number): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: planet } })
  return session.state()
}

/** From system 1's P5, the jump drive fitted, jumped to system 2's `place`. */
function onSystemTwoPlanet(place: string): AuthorityState {
  const session = continueScriptedSession(onFirstSystemPlanet(5))
  session.submit(1, money)
  session.submit(1, dock)
  session.submit(2, { type: 'buyJumpDrive', payload: {} })
  session.submit(2, { type: 'buyFuel', payload: { units: 10 } })
  const jumped = session.submit(3, jumpTo('2', place))
  expect(typesOf(jumped)).toContain('PlanetEntered')
  return session.state()
}

/** Drill and tip set well past the planet's curve, so every cell near the surface breaks. */
function withStrongDrill(start: AuthorityState) {
  const session = continueScriptedSession(start)
  const ahead = start.planet.index + DRILL_LEAD_PLANETS
  for (const upgradeId of ['drill_power', 'drill_tip'] as const) {
    const level = onCurveStep(upgradeId, ahead)
    session.submit(start.tick + 1, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  session.submit(start.tick + 1, { type: 'undock', payload: {} })
  return session
}

/** Near-surface ore cells of the planet that wear a species. */
function kindedOreTiles(state: AuthorityState): TilePoint[] {
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('no world')
  return surfaceOreTiles(60, params)
    .filter((tile) => planetSpeciesOf(params, kindSlotOfCell(cellAt(state.world, params, tile))))
    .slice(0, DUG_PER_PLANET)
}

/** Digs the cells and reads which species the codex met, by the cells as they stood. */
function dugSpeciesOf(start: AuthorityState): { dug: number; met: string[] } {
  const params = planetParamsOf(start.planet)
  if (params === null) throw new Error('no world')
  const tiles = kindedOreTiles(start)
  const ids = tiles.map(
    (tile) => planetSpeciesOf(params, kindSlotOfCell(cellAt(start.world, params, tile)))?.id ?? '',
  )
  const session = withStrongDrill(start)
  let tick = start.tick + 2
  let dug = 0
  for (const tile of tiles) {
    const events = mineTile(session, tick, tile)
    if (typesOf(events).includes('CargoAdded')) dug += 1
    tick += 50
  }
  const met = ids.filter((id) => hasDiscovered(session.state(), 'p1', `material:${id}`, NEVER_MET))
  return { dug, met }
}

function poolIdsOf(state: AuthorityState): Set<string> {
  const params = planetParamsOf(state.planet)
  if (params === null) throw new Error('no world')
  const system = systemOfParams(params)
  const place = placeOfCampaign(system, BigInt(params.planetIndex))
  const pool = materialPoolAt(params.worldSeed, system, place, params.oreRulesVersion)
  return new Set(pool.kinds.map((kind) => kind.id))
}

const PLANETS: readonly (readonly [string, () => AuthorityState])[] = [
  ['system 1 P6', () => onFirstSystemPlanet(6)],
  ['system 1 P8', () => onFirstSystemPlanet(8)],
  ['system 1 P40', () => onFirstSystemPlanet(40)],
  ['system 2 p1', () => onSystemTwoPlanet('1')],
  ['system 2 p3', () => onSystemTwoPlanet('3')],
]

describe('generated pools in play (ticket 888)', () => {
  it.each(PLANETS)("digs %s's cells as species of its own generated pool", (_, landOn) => {
    const start = landOn()
    const { dug, met } = dugSpeciesOf(start)
    expect(dug).toBe(DUG_PER_PLANET)
    expect(met).toHaveLength(DUG_PER_PLANET)
    const pool = poolIdsOf(start)
    for (const id of met) expect(pool.has(id), id).toBe(true)
  })
})
