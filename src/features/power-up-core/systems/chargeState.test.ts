import { describe, expect, it } from 'vitest'
import { readSnapshot, takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { FAKE, inField } from '../fakeItems'
import { POWER_UP_SECTION, powerUpStateOf } from './chargeState'
import { intentToUseSlot } from './slotUse'

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

  it('names what is wrong with a malformed body', () => {
    expect(POWER_UP_SECTION.problems({ items: { x: { spent: -1 } }, pending: 3 })).toEqual([
      'power-up-core.items.x must be {spent, readyAtTick} whole numbers',
      'power-up-core.pending must be null or a pending use',
      'power-up-core.toggledOn must be a list of item ids',
    ])
  })
})
