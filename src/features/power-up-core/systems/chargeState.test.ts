import { describe, expect, it } from 'vitest'
import { readSnapshot, takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { FAKE, inField } from '../fakeItems'
import { DASHER, inMarkedField } from '../fakeMilestoneItems'
import { POWER_UP_SECTION, powerUpStateOf } from './chargeState'
import { intentToHoldSlot, intentToUseSlot } from './slotUse'

// The `power-up-core` save section v1 (#200 lock item 2): charges, cooldowns and the pending use
// survive a snapshot exactly, and a malformed body is refused with its problems.

describe('power-up save section', () => {
  it('stays out of the state until the first use', () => {
    inField((session) => expect(session.state().players.p1.slices).toBeUndefined())
  })

  it('round-trips a spent charge, a cooldown and a channel in progress through a snapshot', () => {
    inField((session) => {
      session.submit(10, intentToUseSlot('powerup.1'))
      session.advanceTo(20)
      session.submit(30, intentToUseSlot('powerup.2'))
      const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
      expect(restored.problems).toEqual([])
      if (!('state' in restored)) return
      expect(powerUpStateOf(restored.state, 'p1')).toEqual(powerUpStateOf(session.state(), 'p1'))
      expect(powerUpStateOf(restored.state, 'p1').pending).toMatchObject({
        itemId: FAKE.channel,
        kind: 'channel',
        actTick: 90,
      })
    })
  })

  it('round-trips the opener of a follow-up and a follow-up winding up (#256)', () => {
    inMarkedField(6, (field) => {
      field.submit(10, intentToUseSlot('powerup.1'))
      field.advanceTo(16)
      field.submit(17, intentToHoldSlot('powerup.1'))
      const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(field.state()))))
      expect(restored.problems).toEqual([])
      if (!('state' in restored)) return
      const value = powerUpStateOf(restored.state, 'p1')
      expect(value).toEqual(powerUpStateOf(field.state(), 'p1'))
      expect(value.opener).toEqual({ itemId: DASHER, slot: 'powerup.1', actTick: 16 })
      expect(value.pending).toMatchObject({ itemId: DASHER, milestone: 'hold' })
    })
  })

  it('names a malformed opener and follow-up', () => {
    const pending = { itemId: 'x', slot: 'powerup.1', kind: 'windup', actTick: 1 }
    const body = { items: {}, toggledOn: [], opener: { itemId: 'x' } }
    expect(
      POWER_UP_SECTION.problems({
        ...body,
        pending: { ...pending, originTx: 0, originTy: 0, milestone: 'link' },
      }),
    ).toEqual([
      'power-up-core.pending must be null or a pending use',
      'power-up-core.opener must be {itemId, slot, actTick}',
    ])
  })

  it('names what is wrong with a malformed body', () => {
    expect(POWER_UP_SECTION.problems({ items: { x: { spent: -1 } }, pending: 3 })).toEqual([
      'power-up-core.items.x must be {spent, readyAtTick} whole numbers',
      'power-up-core.pending must be null or a pending use',
      'power-up-core.toggledOn must be a list of item ids',
    ])
  })
})
