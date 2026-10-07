import { describe, expect, it } from 'vitest'
import { FAKE, inField } from '../fakeItems'
import { slotButtonsOf } from './slotColumn'
import { intentToUseSlot } from './slotUse'

// The touch slot column as data (#162 section 2.3, #173): a button only for a slot holding a
// usable power-up, with its pips and cooldown ring.

describe('power-up slot column', () => {
  it('shows no button while no slot holds a power-up', () => {
    inField((session) => expect(slotButtonsOf(session.state(), 'p1')).toEqual([]), { slots: {} })
  })

  it('shows one button per usable slotted power-up, slot 1 first', () => {
    inField(
      (session) => {
        const buttons = slotButtonsOf(session.state(), 'p1')
        expect(buttons.map(({ slot, action, itemId }) => ({ slot, action, itemId }))).toEqual([
          { slot: 'powerup.1', action: 'use_slot_1', itemId: FAKE.charged },
          { slot: 'powerup.2', action: 'use_slot_2', itemId: FAKE.toggle },
        ])
      },
      { slots: { 'powerup.1': FAKE.charged, 'powerup.2': FAKE.toggle } },
    )
  })

  it('counts the pips down and sweeps the cooldown ring after a use', () => {
    inField((session) => {
      session.submit(10, intentToUseSlot('powerup.1'))
      expect(slotButtonsOf(session.state(), 'p1')[0]).toMatchObject({
        chargesLeft: 1,
        chargesMax: 2,
        isActing: true,
        cooldownPercent: 0,
      })
      session.advanceTo(31)
      expect(slotButtonsOf(session.state(), 'p1')[0]).toMatchObject({
        isActing: false,
        cooldownPercent: 50,
      })
      session.advanceTo(46)
      expect(slotButtonsOf(session.state(), 'p1')[0].cooldownPercent).toBe(0)
    })
  })
})
