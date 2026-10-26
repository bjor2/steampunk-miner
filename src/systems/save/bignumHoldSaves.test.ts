import { describe, expect, it } from 'vitest'
import { vehicleOf, withVehicle, type AuthorityState } from '../authority/authorityState'
import { createScriptedSession } from '../authority/scriptedSession'
import { takeSnapshot } from '../authority/sessionSnapshot'
import { stateDigest } from '../authority/stateDigest'
import { cargoCapacity } from '../economy/vehicleStats'
import { readMigratedSaveSlot } from './saveMigrations'
import { saveSlotOf } from './saveSlot'

// Ticket 849: the hold counts in bigint and a save writes a count past 2^53 as decimal text. A
// snapshot 27 save holds safe integers only, the spelling this build writes below 2^53, so it
// loads as saved: the step checks its digest and keeps its state.

const throughJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** The last hold under 2^53, full, with a Refinery batch of the same units queued. */
function fullHoldAtLevel361(): AuthorityState {
  const state = createScriptedSession().state()
  const vehicle = vehicleOf(state, 'p1')
  const capacity = cargoCapacity(361)
  const held = withVehicle(state, 'p1', {
    ...vehicle,
    levels: { ...vehicle.levels, cargo_hold: 361 },
    cargo: { ...vehicle.cargo, ore: { '1': capacity } },
  })
  const batch = { owner: 'p1', tier: 1, units: capacity / 2n, readyAtTick: 9, queuedTick: 1 }
  const refinerySlots = [{ ...batch, queuedPlanet: 1 }]
  return { ...held, platform: { ...held.platform, refinerySlots } }
}

describe('save migration: snapshot 27 -> 28, the bignum hold (ticket 849)', () => {
  it('loads a snapshot 27 save of a full level-361 hold through its step, state and digest as saved', () => {
    const state = fullHoldAtLevel361()
    const file = throughJson(saveSlotOf({ ...takeSnapshot(state), snapshotVersion: 27 }, 1))
    expect(JSON.stringify(file)).toContain(`"ore":{"1":${cargoCapacity(361)}}`)
    const reading = readMigratedSaveSlot(file)
    if (!('state' in reading)) throw new Error(reading.problems.join('; '))
    expect(reading.migrations).toEqual([
      { version: 'snapshotVersion', from: 27, to: 28 },
      { version: 'snapshotVersion', from: 28, to: 29 },
      { version: 'snapshotVersion', from: 29, to: 30 },
      { version: 'snapshotVersion', from: 30, to: 31 },
    ])
    expect(reading.state).toEqual(state)
    expect(stateDigest(reading.state)).toBe(stateDigest(state))
  })

  it('refuses a snapshot 27 save whose digest does not hold over its hold', () => {
    const file = throughJson(
      saveSlotOf({ ...takeSnapshot(fullHoldAtLevel361()), snapshotVersion: 27 }, 1),
    )
    const capacity = cargoCapacity(361)
    const text = JSON.stringify(file).replace(
      `"ore":{"1":${capacity}`,
      `"ore":{"1":${capacity - 1n}`,
    )
    const tampered = JSON.parse(text) as unknown
    expect('state' in readMigratedSaveSlot(tampered)).toBe(false)
  })
})
