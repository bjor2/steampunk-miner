import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../authority/authorityState'
import { createScriptedSession } from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import { fuelTankLevelOf } from '../vehicle/vehicleFuel'
import PLANET_5_SAVE from './fixtures/pre-181-planet-5.save.json'
import { readMigratedSaveSlot } from './saveMigrations'
import { readSaveSlot, saveSlotOf } from './saveSlot'

function restoredState(file: unknown): AuthorityState {
  const reading = readMigratedSaveSlot(file)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

/** A session docked on planet 1 that bought two tank levels. */
function tankedSession(): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e6' } })
  session.submit(5, { type: 'dock', payload: { bay: 'sell' } })
  session.submit(6, { type: 'buyFuelTank', payload: {} })
  session.submit(7, { type: 'buyFuelTank', payload: {} })
  return session.state()
}

describe('save migration: snapshot 22 -> 23, the fuel tank track (ticket 756)', () => {
  it('loads a save from before the tank track with the starting tank on every vehicle', () => {
    const state = restoredState(PLANET_5_SAVE)
    for (const player of Object.values(state.players)) {
      expect(fuelTankLevelOf(player.vehicle)).toBe(1)
      expect('fuelTankLevel' in player.vehicle).toBe(false)
    }
  })

  it('loads a snapshot 22 save through the one step with its state and digest as saved', () => {
    const state = createScriptedSession().state()
    const file = saveSlotOf({ ...takeSnapshot(state), snapshotVersion: 22 }, 1)
    const reading = readMigratedSaveSlot(file)
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations).toEqual([{ version: 'snapshotVersion', from: 22, to: 23 }])
    expect(reading.state).toEqual(state)
    expect(stateDigest(reading.state)).toBe(stateDigest(state))
  })

  it('keeps a bought tank level through save and load', () => {
    const state = tankedSession()
    const reading = readSaveSlot(JSON.parse(JSON.stringify(saveSlotOf(takeSnapshot(state), 1))))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.state).toEqual(state)
    expect(fuelTankLevelOf(reading.state.players.p1.vehicle)).toBe(3)
  })
})
