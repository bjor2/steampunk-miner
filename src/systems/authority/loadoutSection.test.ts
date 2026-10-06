import { describe, expect, it } from 'vitest'
import { CONTENT_REGISTRY, contentRegistrationOf } from '../registries/content'
import { addToRegistry, withFreshRegistrySet } from '../registries/seal'
import { readSaveSlot, saveSlotOf } from '../save/saveSlot'
import { stateDigest } from './stateDigest'
import { setVehicleLoadoutCommand } from './loadoutCommands'
import { readSnapshot, takeSnapshot, type SessionSnapshot } from './sessionSnapshot'
import { createScriptedSession } from './scriptedSession'

/** A session whose vehicle carries a twin-bit head, an echo sounder and an owned extractor. */
function equippedSession() {
  return withFreshRegistrySet(
    () => {
      const add = (id: string, slots: readonly ('drill.head' | 'powerup.1')[]) =>
        addToRegistry(
          CONTENT_REGISTRY,
          'items',
          contentRegistrationOf('vehicle-item', { id, iconId: id, slots, attach: null }),
        )
      add('drill-gear.twin_bit', ['drill.head'])
      add('sensing.echo_sounder', ['powerup.1'])
      add('rig.resonance', [])
    },
    () => {
      const session = createScriptedSession()
      session.submit(
        0,
        setVehicleLoadoutCommand(
          { 'drill.head': 'drill-gear.twin_bit', 'powerup.1': 'sensing.echo_sounder' },
          ['rig.resonance'],
        ),
      )
      return session
    },
  )
}

function withLoadoutVersion(snapshot: SessionSnapshot, version: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(snapshot)) as SessionSnapshot
  ;(copy.state.players.p1.vehicle.loadout as { version: unknown }).version = version
  return copy
}

describe('the loadout save section (K4)', () => {
  it('travels as section version 1 in the snapshot', () => {
    const snapshot = takeSnapshot(equippedSession().state())
    expect(snapshot.state.players.p1.vehicle.loadout).toEqual({
      version: 1,
      body: {
        slots: expect.objectContaining({
          'drill.head': 'drill-gear.twin_bit',
          'powerup.1': 'sensing.echo_sounder',
          'powerup.2': null,
        }),
        owned: ['drill-gear.twin_bit', 'rig.resonance', 'sensing.echo_sounder'],
      },
    })
  })

  it('round-trips through the snapshot to the same state', () => {
    const state = equippedSession().state()
    const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(state))))
    expect(restored.problems).toEqual([])
    expect('state' in restored && restored.state.players.p1.vehicle.loadout).toEqual(
      state.players.p1.vehicle.loadout,
    )
  })

  it('round-trips through the checkpoint save with the same digest', () => {
    const state = equippedSession().state()
    const file = JSON.parse(JSON.stringify(saveSlotOf(takeSnapshot(state), 3)))
    const reading = readSaveSlot(file)
    expect(reading.problems).toEqual([])
    expect('state' in reading && stateDigest(reading.state)).toBe(stateDigest(state))
  })

  it('refuses a snapshot whose loadout section has another version, restoring nothing', () => {
    const snapshot = takeSnapshot(equippedSession().state())
    expect(readSnapshot(withLoadoutVersion(snapshot, 0)).problems).toEqual([
      'snapshot.state.players.p1.vehicle.loadout.version is 0, this build reads 1',
    ])
  })

  it('refuses a malformed loadout body with its problems listed', () => {
    const snapshot = JSON.parse(JSON.stringify(takeSnapshot(createScriptedSession().state())))
    snapshot.state.players.p1.vehicle.loadout.body = { slots: { 'rig.1': null }, owned: ['b', 'a'] }
    expect(readSnapshot(snapshot).problems).toEqual([
      'snapshot.state.players.p1.vehicle.loadout.body.slots must hold every loadout slot, each an item id or null',
      'snapshot.state.players.p1.vehicle.loadout.body.owned must be item ids, sorted, each once',
    ])
  })
})
