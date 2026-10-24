import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../authority/authorityState'
import { createScriptedSession } from '../authority/scriptedSession'
import { readSnapshot, takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import { hasJumpDrive } from '../vehicle/vehicleJumpDrive'
import PLANET_5_SAVE from './fixtures/pre-181-planet-5.save.json'
import { readMigratedSaveSlot } from './saveMigrations'
import { readSaveSlot, saveSlotOf } from './saveSlot'

const throughJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function restoredState(file: unknown): AuthorityState {
  const reading = readMigratedSaveSlot(file)
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  return reading.state
}

/** A session that bought the jump drive and jumped into system 2. */
function jumpedSession(): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: 5 } })
  session.submit(1, { type: 'debug.setMoney', payload: { amount: '1e9' } })
  session.submit(5, { type: 'dock', payload: { bay: 'sell' } })
  session.submit(6, { type: 'buyJumpDrive', payload: {} })
  session.submit(7, { type: 'buyFuel', payload: { units: 7 } })
  session.submit(8, { type: 'jumpToPlanet', payload: { system: '2', planet: '1' } })
  return session.state()
}

describe('save migration: snapshot 23 -> 24, the jump drive (ticket 759)', () => {
  it('loads a save from before the jump drive with no drive on any vehicle', () => {
    const state = restoredState(PLANET_5_SAVE)
    for (const player of Object.values(state.players)) {
      expect(hasJumpDrive(player.vehicle)).toBe(false)
      expect('jumpDrive' in player.vehicle).toBe(false)
    }
  })

  it('loads a snapshot 23 save through its step and the later steps, state and digest as saved', () => {
    const state = createScriptedSession().state()
    const file = saveSlotOf({ ...takeSnapshot(state), snapshotVersion: 23 }, 1)
    const reading = readMigratedSaveSlot(file)
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations).toEqual([
      { version: 'snapshotVersion', from: 23, to: 24 },
      { version: 'snapshotVersion', from: 24, to: 25 },
      { version: 'snapshotVersion', from: 25, to: 26 },
    ])
    expect(reading.state).toEqual(state)
    expect(stateDigest(reading.state)).toBe(stateDigest(state))
  })

  it('keeps the drive and the planet of system 2 through save and load', () => {
    const state = jumpedSession()
    expect(state.planet).toMatchObject({ index: 6, system: '2' })
    const reading = readSaveSlot(throughJson(saveSlotOf(takeSnapshot(state), 1)))
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.state).toEqual(state)
    expect(hasJumpDrive(reading.state.players.p1.vehicle)).toBe(true)
  })

  it('refuses a snapshot whose drive is anything but true, with the problem listed', () => {
    const snapshot = throughJson(takeSnapshot(jumpedSession()))
    Object.assign(snapshot.state.players.p1.vehicle, { jumpDrive: false })
    expect(readSnapshot(snapshot).problems).toEqual([
      'snapshot.state.players.p1.vehicle.jumpDrive must be true once bought, or be left out',
    ])
  })
})
