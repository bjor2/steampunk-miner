import { describe, expect, it } from 'vitest'
import { FAKE, FAKE_HOLD, inField } from '../fakeItems'
import { slotButtonsOf } from './slotColumn'
import { intentToUseSlot } from './slotUse'

// The touch slot column as data (#162 section 2.3, #173): a button only for an open slot holding a
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

  it('shows no button for a locked slot, even one holding a power-up', () => {
    inField(
      (session) => {
        const slots = slotButtonsOf(session.state(), 'p1').map((button) => button.slot)
        expect(slots).toEqual(['powerup.1'])
      },
      { slots: { 'powerup.1': FAKE.charged, 'powerup.5': FAKE.consumable } },
    )
  })

  it('adds a tile for drill gear in the flank and collar after slot 5, pressing their keys (244)', () => {
    inField(
      (session) => {
        const buttons = slotButtonsOf(session.state(), 'p1')
        expect(buttons.map(({ slot, action, itemId }) => ({ slot, action, itemId }))).toEqual([
          { slot: 'powerup.1', action: 'use_slot_1', itemId: FAKE.charged },
          { slot: 'drill.flank', action: 'use_drill_flank', itemId: FAKE.toggle },
          { slot: 'drill.collar', action: 'use_drill_collar', itemId: FAKE.drawingToggle },
        ])
      },
      {
        slots: {
          'drill.collar': FAKE.drawingToggle,
          'powerup.1': FAKE.charged,
          'drill.flank': FAKE.toggle,
        },
      },
    )
  })

  it('shows no tile for an empty socket or one holding gear a press does not use (244)', () => {
    inField(
      (session) => expect(slotButtonsOf(session.state(), 'p1').map(({ slot }) => slot)).toEqual([]),
      { slots: { 'drill.flank': FAKE.extractor } },
    )
  })

  it('lights a drill socket tile while its toggle is on (244)', () => {
    inField(
      (session) => {
        const isOn = () => slotButtonsOf(session.state(), 'p1')[0].isOn
        expect(isOn()).toBe(false)
        session.submit(2, intentToUseSlot('drill.flank'))
        expect(isOn()).toBe(true)
        session.submit(3, intentToUseSlot('drill.flank'))
        expect(isOn()).toBe(false)
      },
      { slots: { 'drill.flank': FAKE.toggle } },
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

  it("fills the hold ring with the share of the item's hold already held (253)", () => {
    inField(
      (session) => {
        const holdPercentAt = (tick: number) => {
          session.advanceTo(tick)
          return slotButtonsOf(session.state(), 'p1')[0].holdPercent
        }
        expect(holdPercentAt(FAKE_HOLD.startTick - 1)).toBe(0)
        expect(holdPercentAt(FAKE_HOLD.startTick)).toBe(0)
        expect(holdPercentAt(FAKE_HOLD.startTick + 45)).toBe(50)
        expect(holdPercentAt(FAKE_HOLD.finishTick - 1)).toBe(98)
        expect(holdPercentAt(FAKE_HOLD.finishTick)).toBe(0)
      },
      { slots: { 'powerup.1': FAKE.consumable } },
    )
  })

  it('leaves the hold ring empty for an item that keeps no hold', () => {
    inField((session) => {
      session.advanceTo(FAKE_HOLD.startTick + 45)
      expect(slotButtonsOf(session.state(), 'p1')[0].holdPercent).toBe(0)
    })
  })
})
