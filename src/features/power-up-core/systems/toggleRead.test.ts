import { describe, expect, it } from 'vitest'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import { FAKE, inField } from '../fakeItems'
import { intentToUseSlot } from './slotUse'
import { isToggleEngaged } from './toggleRead'

// The toggle read another slice's effect answers to (ticket 234): on and still slotted.

const press = intentToUseSlot('powerup.1')
const SLOTS = { 'powerup.1': FAKE.drawingToggle }

describe('toggle read', () => {
  it('reads a toggle as engaged from its switch-on press until its switch-off press', () => {
    inField(
      (session) => {
        const isEngaged = () => isToggleEngaged(session.state(), 'p1', FAKE.drawingToggle)
        expect(isEngaged()).toBe(false)
        session.submit(10, press)
        expect(isEngaged()).toBe(true)
        session.submit(20, press)
        expect(isEngaged()).toBe(false)
      },
      { slots: SLOTS },
    )
  })

  it('reads a switched-on toggle taken out of its slot as not engaged', () => {
    inField(
      (session) => {
        session.submit(10, press)
        session.submit(11, setVehicleLoadoutCommand({}, []))
        expect(isToggleEngaged(session.state(), 'p1', FAKE.drawingToggle)).toBe(false)
      },
      { slots: SLOTS },
    )
  })
})
