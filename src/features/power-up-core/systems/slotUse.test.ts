import { describe, expect, it } from 'vitest'
import { reactionToPress, type InputSituation } from '../../../systems/input/inputRouting'
import { SLOT_ACTION_IDS } from '../../../systems/input/touchControls'
import { ACTION_MAP, actionDefOf } from '../../../systems/input/actionMap'
import { FAKE, inField } from '../fakeItems'
import type { ScriptedSession } from '../../../systems/authority/scriptedSession'

// The slot keys (#162 G&V E1, the #217 input lock): Digit1-5 use what the slot holds at once; an
// empty or locked slot, or an item no press uses, does nothing.

function drivingIn(session: ScriptedSession): InputSituation {
  return {
    layer: 'vehicle',
    vehicleMode: 'active',
    dockableBay: null,
    dockedBay: null,
    canOpenArtefactCache: false,
    gunMode: null,
    plantableChargeSize: null,
    nextChargeSize: null,
    state: session.state(),
    playerId: 'p1',
  }
}

describe('power-up slot keys', () => {
  it('binds use_slot_1 to use_slot_5 to Digit1 to Digit5 (G&V E1)', () => {
    expect(SLOT_ACTION_IDS.map((id) => actionDefOf(ACTION_MAP, id).keyboard)).toEqual([
      ['Digit1'],
      ['Digit2'],
      ['Digit3'],
      ['Digit4'],
      ['Digit5'],
    ])
  })

  it('submits use_power_up for the slot a key names when it holds a power-up', () => {
    inField((session) => {
      expect(reactionToPress('use_slot_2', drivingIn(session))).toEqual({
        kind: 'submit',
        intent: { type: 'power-up-core.use_power_up', payload: { slot: 'powerup.2' } },
      })
    })
  })

  it('does nothing for an empty slot, a locked one holding a power-up, or an extractor', () => {
    inField(
      (session) => {
        expect(reactionToPress('use_slot_1', drivingIn(session))).toEqual({ kind: 'none' })
        expect(reactionToPress('use_slot_2', drivingIn(session))).toEqual({ kind: 'none' })
        expect(reactionToPress('use_slot_4', drivingIn(session))).toEqual({ kind: 'none' })
      },
      { slots: { 'powerup.1': FAKE.extractor, 'powerup.4': FAKE.charged } },
    )
  })
})
