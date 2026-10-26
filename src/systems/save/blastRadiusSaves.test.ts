import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../authority/authorityState'
import { createScriptedSession } from '../authority/scriptedSession'
import { readSnapshot, takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import { blastRadiusLevelOf } from '../vehicle/vehicleCharges'
import { readMigratedSaveSlot } from './saveMigrations'
import { readSaveSlot, saveSlotOf } from './saveSlot'

const LEVELS = [0, 10, 1_000_000]

/** A session on planet 1 whose rig owns Blast Radius `level`: one bought, the rest a scenario's. */
function sessionAtLevel(level: number): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '1e30' } })
  session.submit(1, { type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  if (level > 0) session.submit(2, { type: 'buyBlastRadiusLevel', payload: { chain: 0 } })
  session.submit(3, { type: 'debug.setBlastRadiusLevel', payload: { level } })
  return session.state()
}

/** The save's text, and the text it saves as again once loaded. */
function savedTwice(state: AuthorityState): {
  first: string
  second: string
  loaded: AuthorityState
} {
  const first = JSON.stringify(saveSlotOf(takeSnapshot(state), 1))
  const reading = readSaveSlot(JSON.parse(first))
  if (!('state' in reading)) throw new Error(reading.problems.join('; '))
  const second = JSON.stringify(saveSlotOf(takeSnapshot(reading.state), 1))
  return { first, second, loaded: reading.state }
}

/** A snapshot of `state` whose p1 charges carry `radiusLevel` as written. */
function snapshotWithLevel(state: AuthorityState, radiusLevel: unknown) {
  const snapshot = takeSnapshot(state)
  const p1 = snapshot.state.players.p1
  const charges = { ...p1.vehicle.charges, radiusLevel }
  const vehicle = { ...p1.vehicle, charges }
  return { ...snapshot, state: { ...snapshot.state, players: { p1: { ...p1, vehicle } } } }
}

describe('save: the Blast Radius level (ticket 869)', () => {
  it.each(LEVELS)('saves, loads and saves again byte for byte at level %d', (level) => {
    const state = sessionAtLevel(level)
    const { first, second, loaded } = savedTwice(state)
    expect(second).toBe(first)
    expect(loaded).toEqual(state)
    expect(blastRadiusLevelOf(loaded.players.p1.vehicle.charges)).toBe(level)
  })

  it('writes no level key for a rig that owns none, so its digest is the one before the track', () => {
    const state = sessionAtLevel(0)
    expect(state.players.p1.vehicle.charges).not.toHaveProperty('radiusLevel')
    expect(savedTwice(state).first).not.toContain('radiusLevel')
  })

  it('loads a snapshot 30 save through its step with its state and digest kept', () => {
    const state = createScriptedSession().state()
    const file = saveSlotOf({ ...takeSnapshot(state), snapshotVersion: 30 }, 1)
    const reading = readMigratedSaveSlot(file)
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations).toEqual([{ version: 'snapshotVersion', from: 30, to: 31 }])
    expect(reading.state).toEqual(state)
    expect(stateDigest(reading.state)).toBe(stateDigest(state))
  })

  it('refuses a saved level of 0, a fraction or a negative: a level is a whole number from 1', () => {
    const state = createScriptedSession().state()
    for (const radiusLevel of [0, 1.5, -1, '10']) {
      expect(readSnapshot(snapshotWithLevel(state, radiusLevel)).problems).toContainEqual(
        expect.stringContaining('a Blast Radius level from 1 or none'),
      )
    }
  })
})
