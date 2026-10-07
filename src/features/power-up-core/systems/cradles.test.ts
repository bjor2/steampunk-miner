import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { ScriptedSession } from '../../../systems/authority/scriptedSession'
import { isSlotOpen } from '../../../systems/vehicle/loadoutState'
import { FAKE, inField } from '../fakeItems'
import { CRADLE_IDS } from './cradles'
import { POWER_UP_SLOTS } from './powerUpSlots'
import { slotButtonsOf } from './slotColumn'
import { intentToUseSlot } from './slotUse'

// The three cradles open power-up slots 3 to 5 through ownership alone (#200 acceptance 4; the
// store buy waits on #165).

const openPowerUpSlotsOf = (session: ScriptedSession) =>
  POWER_UP_SLOTS.filter((slot) => isSlotOpen(session.state().players.p1.vehicle.loadout, slot))

const typesOf = (events: readonly DomainEvent[]) => events.map((event) => event.type)

describe('power-up cradles', () => {
  it('are bare catalogue ids, one for each slot past the second', () => {
    expect(CRADLE_IDS).toEqual(['slot.powerup_3', 'slot.powerup_4', 'slot.powerup_5'])
  })

  it('raise the open power-up slots from 2 to 5 as they are owned', () => {
    const openCounts = [0, 1, 2, 3].map((owned) =>
      inField((session) => openPowerUpSlotsOf(session).length, {
        owned: CRADLE_IDS.slice(0, owned),
      }),
    )
    expect(openCounts).toEqual([2, 3, 4, 5])
  })

  it('open the slot they name and no other', () => {
    const open = inField(openPowerUpSlotsOf, { owned: ['slot.powerup_5'] })
    expect(open).toEqual(['powerup.1', 'powerup.2', 'powerup.5'])
  })

  it('let a power-up in slot 5 act once its cradle is owned, and refuse it as locked before', () => {
    const slots = { 'powerup.5': FAKE.consumable }
    const pressSlot5 = (owned: readonly string[]) =>
      inField(
        (session) => [
          ...typesOf(session.submit(10, intentToUseSlot('powerup.5'))),
          ...typesOf(session.advanceTo(20)),
        ],
        { slots, owned },
      )
    expect(pressSlot5([])).toEqual(['CommandRejected'])
    expect(pressSlot5(['slot.powerup_5'])).toEqual(['power-up-core.PowerUpUsed'])
  })

  it('draw a slot 5 button on the touch column only once owned', () => {
    const drawnSlots = (owned: readonly string[]) =>
      inField((session) => slotButtonsOf(session.state(), 'p1').map((button) => button.slot), {
        slots: { 'powerup.1': FAKE.charged, 'powerup.5': FAKE.consumable },
        owned,
      })
    expect(drawnSlots([])).toEqual(['powerup.1'])
    expect(drawnSlots(CRADLE_IDS)).toEqual(['powerup.1', 'powerup.5'])
  })
})
