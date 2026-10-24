import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../authority/authorityState'
import { systemOfPlanet } from '../authority/planetOfState'
import { createScriptedSession } from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import { toCanonical } from '../money'
import { fuelOf } from '../vehicle/vehicleFuel'
import PLANET_1_SAVE from './fixtures/pre-175-planet-1.save.json'
import PLANET_10_SAVE from './fixtures/pre-175-planet-10.save.json'
import PLANET_5_SAVE from './fixtures/pre-181-planet-5.save.json'
import { readMigratedSaveSlot } from './saveMigrations'
import { readSaveSlot, saveSlotOf } from './saveSlot'

const STAR_MAP_STEP = { version: 'snapshotVersion', from: 21, to: 22 }
const FUEL_TANK_STEP = { version: 'snapshotVersion', from: 22, to: 23 }
const JUMP_DRIVE_STEP = { version: 'snapshotVersion', from: 23, to: 24 }
const CORE_BAY_STEP = { version: 'snapshotVersion', from: 24, to: 25 }
const AIM_STEP = { version: 'snapshotVersion', from: 25, to: 26 }

function restoredState(file: unknown): AuthorityState {
  const reading = readMigratedSaveSlot(file)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

/** A session docked on planet 1 that bought 8 fuel and jumped to planet 3, keeping 2. */
function jumpedSession(): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e6' } })
  session.submit(5, { type: 'dock', payload: { bay: 'sell' } })
  session.submit(6, { type: 'buyFuel', payload: { units: 8 } })
  session.submit(10, { type: 'jumpToPlanet', payload: { system: '1', planet: '3' } })
  return session.state()
}

describe('save migration: snapshot 21 -> 22, the star map (ticket 755)', () => {
  it.each([
    ['pre-#175 planet 1', PLANET_1_SAVE],
    ['pre-#175 planet 10', PLANET_10_SAVE],
    ['pre-#181 planet 5', PLANET_5_SAVE],
  ])('loads the %s save in system 1 with every tank empty', (_name, file) => {
    const state = restoredState(file)
    expect(systemOfPlanet(state.planet)).toBe(1n)
    expect('system' in state.planet).toBe(false)
    for (const player of Object.values(state.players)) {
      expect('fuel' in player.vehicle).toBe(false)
    }
  })

  it('loads a snapshot 21 save through its identity steps with its state and digest as saved', () => {
    const state = createScriptedSession().state()
    const file = saveSlotOf({ ...takeSnapshot(state), snapshotVersion: 21 }, 1)
    const reading = readMigratedSaveSlot(file)
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations).toEqual([
      STAR_MAP_STEP,
      FUEL_TANK_STEP,
      JUMP_DRIVE_STEP,
      CORE_BAY_STEP,
      AIM_STEP,
    ])
    expect(reading.state).toEqual(state)
    expect(stateDigest(reading.state)).toBe(stateDigest(state))
  })

  it('refuses a snapshot 21 save whose digest does not hold over its state', () => {
    const snapshot = takeSnapshot(createScriptedSession().state())
    const file = saveSlotOf({ ...snapshot, snapshotVersion: 21, digest: '0000000000000000' }, 1)
    expect(readMigratedSaveSlot(file).problems).not.toEqual([])
  })

  it('keeps the tank and the planet a jump left through save and load', () => {
    const state = jumpedSession()
    const reading = readSaveSlot(JSON.parse(JSON.stringify(saveSlotOf(takeSnapshot(state), 1))))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.state).toEqual(state)
    expect(reading.state.planet.index).toBe(3)
    expect(toCanonical(fuelOf(reading.state.players.p1.vehicle))).toBe('2e+0')
  })
})
