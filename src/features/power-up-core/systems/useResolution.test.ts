import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { WORLD_SEED } from '../../../systems/authority/scriptedSession'
import { replayRun } from '../../../systems/replay/replayRun'
import {
  actsOf,
  DASHER,
  DASHER_WINDUP_TICKS,
  inMarkedField,
  SWITCH,
  VERBS,
  withTreeAndFakes,
  type MarkedField,
} from '../fakeMilestoneItems'
import { chargesLeftOf, itemChargesOf, powerUpStateOf } from './chargeState'
import { FOLLOW_UP_WINDOW_TICKS } from './followUps'
import { intentToToggleLink } from './linkToggle'
import { powerUpAtMarkOf } from './powerUpMarks'
import { intentToHoldSlot, intentToUseSlot } from './slotUse'

// Mark milestones that follow a use (the GD lock on #256, build 2), on the fake dasher (charged:
// M3 second tap, M6 hold) and switch (toggle: M3 hold, M6 second tap). The dasher's first press at
// tick 10 acts at 16 after its 6-tick wind-up; its cooldown at Marks 2 to 6 is 221 ticks.

const PRESS_TICK = 10
const ACT_TICK = PRESS_TICK + DASHER_WINDUP_TICKS
const press = (slot: 'powerup.1' | 'powerup.2') => intentToUseSlot(slot)

const verbsOf = (field: MarkedField) => actsOf(field.state()).map((act) => act.verb)

const ofType = (events: readonly DomainEvent[], type: string) =>
  events.filter((event) => event.type === type)

function rejectionOf(field: MarkedField, tick: number, intent: CommandIntent) {
  const rejected = ofType(field.submit(tick, intent), 'CommandRejected')[0]
  return rejected?.type === 'CommandRejected' ? rejected.reason : null
}

/** The dasher used at tick 10, then pressed again `after` ticks after it acted. */
function tappedTwice(field: MarkedField, after: number) {
  field.submit(PRESS_TICK, press('powerup.1'))
  field.advanceTo(ACT_TICK)
  const second = field.submit(ACT_TICK + after, press('powerup.1'))
  field.advanceTo(ACT_TICK + after + DASHER_WINDUP_TICKS)
  return second
}

describe('Mark milestones: second tap (#256)', () => {
  it('at M3 the input fires the new verb and at M2 the same input does the old thing', () => {
    const atMark3 = inMarkedField(3, (field) => {
      tappedTwice(field, 20)
      return verbsOf(field)
    })
    const atMark2 = inMarkedField(2, (field) => ({
      rejection: ofType(tappedTwice(field, 20), 'CommandRejected')[0],
      verbs: verbsOf(field),
    }))
    expect(atMark3).toEqual([VERBS[DASHER].plain, VERBS[DASHER]['second-tap']])
    expect(atMark2.verbs).toEqual([VERBS[DASHER].plain])
    expect(atMark2.rejection).toMatchObject({ reason: 'power-up-core.cooling_down' })
  })

  it('logs the second tap on power_up_used as the milestone it was', () => {
    inMarkedField(3, (field) => {
      tappedTwice(field, 20)
      expect(ofType(field.events(), 'power-up-core.PowerUpUsed')).toMatchObject([
        { tick: ACT_TICK, itemId: DASHER, mark: 3 },
        { tick: ACT_TICK + 20 + DASHER_WINDUP_TICKS, mark: 3, milestone: 'second-tap' },
      ])
      expect(ofType(field.events(), 'power-up-core.PowerUpUsed')[0]).not.toHaveProperty('milestone')
    })
  })

  it('opens for 30 ticks after the act, the same jumped and at 30 and 144 steps/s', () => {
    const windowOf = (after: number) =>
      inMarkedField(3, (field) => {
        tappedTwice(field, after)
        const endTick = ACT_TICK + after + DASHER_WINDUP_TICKS
        const replays = [undefined, 30, 144].map((framesPerSecond) =>
          withTreeAndFakes(() =>
            replayRun(WORLD_SEED, field.commands, { endTick, framesPerSecond }),
          ),
        )
        return replays.map((replay) => actsOf(replay.state).map((act) => act.verb))
      })
    const fired = [VERBS[DASHER].plain, VERBS[DASHER]['second-tap']]
    expect(windowOf(FOLLOW_UP_WINDOW_TICKS)).toEqual([fired, fired, fired])
    const closed = [VERBS[DASHER].plain]
    expect(windowOf(FOLLOW_UP_WINDOW_TICKS + 1)).toEqual([closed, closed, closed])
  })

  it('spends the normal charge and starts the normal cooldown from its own act', () => {
    inMarkedField(3, (field) => {
      tappedTwice(field, 20)
      const secondAct = ACT_TICK + 20 + DASHER_WINDUP_TICKS
      expect(chargesLeftOf(field.state(), 'p1', DASHER)).toBe(1)
      const { readyAtTick } = itemChargesOf(powerUpStateOf(field.state(), 'p1'), DASHER)
      expect(readyAtTick).toBe(secondAct + 221)
    })
  })

  it('answers its use once: a third press in the window waits out the cooldown', () => {
    inMarkedField(3, (field) => {
      tappedTwice(field, 10)
      expect(rejectionOf(field, ACT_TICK + 20, press('powerup.1'))).toBe(
        'power-up-core.cooling_down',
      )
      expect(verbsOf(field)).toHaveLength(2)
    })
  })

  it("fires a toggle's M6 second tap instead of switching it off, and at M3 switches it off", () => {
    const pressedTwice = (mark: number) =>
      inMarkedField(mark, (field) => {
        field.submit(PRESS_TICK, press('powerup.2'))
        const second = ofType(
          field.submit(PRESS_TICK + 10, press('powerup.2')),
          'power-up-core.PowerUpUsed',
        )
        return { verbs: verbsOf(field), second }
      })
    expect(pressedTwice(6).verbs).toEqual([VERBS[SWITCH].plain, VERBS[SWITCH]['second-tap']])
    expect(pressedTwice(6).second).toMatchObject([{ toggledOn: true, milestone: 'second-tap' }])
    expect(pressedTwice(3).verbs).toEqual([VERBS[SWITCH].plain])
    expect(pressedTwice(3).second).toMatchObject([{ toggledOn: false }])
  })
})

describe('Mark milestones: hold (#256)', () => {
  /** The dasher used at tick 10 and held past its wind-up: the hold arrives the tick after the act. */
  function heldPastWindup(field: MarkedField) {
    field.submit(PRESS_TICK, press('powerup.1'))
    field.advanceTo(ACT_TICK)
    const hold = field.submit(ACT_TICK + 1, intentToHoldSlot('powerup.1'))
    field.advanceTo(ACT_TICK + 1 + DASHER_WINDUP_TICKS)
    return hold
  }

  it('at M6 the input fires the new verb and at M5 the same input does the old thing', () => {
    const atMark6 = inMarkedField(6, (field) => {
      heldPastWindup(field)
      return verbsOf(field)
    })
    const atMark5 = inMarkedField(5, (field) => ({
      rejection: ofType(heldPastWindup(field), 'CommandRejected')[0],
      verbs: verbsOf(field),
      chargesLeft: chargesLeftOf(field.state(), 'p1', DASHER),
      chargesMax: powerUpAtMarkOf(field.state(), 'p1', DASHER)?.charges ?? 0,
    }))
    expect(atMark6).toEqual([VERBS[DASHER].plain, VERBS[DASHER].hold])
    expect(atMark5.verbs).toEqual([VERBS[DASHER].plain])
    expect(atMark5.rejection).toMatchObject({ reason: 'power-up-core.no_milestone' })
    expect(atMark5.chargesLeft).toBe(atMark5.chargesMax - 1)
  })

  it('is two actions and two charges, logged as the hold it was', () => {
    inMarkedField(6, (field) => {
      const before = chargesLeftOf(field.state(), 'p1', DASHER)
      heldPastWindup(field)
      expect(chargesLeftOf(field.state(), 'p1', DASHER)).toBe(before - 2)
      expect(ofType(field.events(), 'power-up-core.PowerUpUsed')).toMatchObject([
        { tick: ACT_TICK, mark: 6 },
        { tick: ACT_TICK + 1 + DASHER_WINDUP_TICKS, mark: 6, milestone: 'hold' },
      ])
    })
  })

  it('hands a follow-up the same Mark and magnitude as the use it follows, never more', () => {
    const numbersOf = (mark: number, follow: (field: MarkedField) => void) =>
      inMarkedField(mark, (field) => {
        follow(field)
        return actsOf(field.state()).map((act) => ({ mark: act.mark, magnitude: act.magnitude }))
      })
    const held = numbersOf(6, heldPastWindup)
    const tapped = numbersOf(6, (field) => tappedTwice(field, 20))
    expect(held).toHaveLength(2)
    expect(held[1]).toEqual(held[0])
    expect(tapped[1]).toEqual(tapped[0])
  })

  it('refuses, at no cost, a hold with no use of the slot to follow', () => {
    inMarkedField(6, (field) => {
      expect(rejectionOf(field, PRESS_TICK, intentToHoldSlot('powerup.1'))).toBe(
        'power-up-core.nothing_to_hold',
      )
      field.submit(PRESS_TICK, press('powerup.1'))
      field.advanceTo(ACT_TICK)
      const late = ACT_TICK + FOLLOW_UP_WINDOW_TICKS + 1
      expect(rejectionOf(field, late, intentToHoldSlot('powerup.1'))).toBe(
        'power-up-core.nothing_to_hold',
      )
      expect(verbsOf(field)).toEqual([VERBS[DASHER].plain])
    })
  })

  it("fires a toggle's M3 hold and leaves it switched on", () => {
    inMarkedField(3, (field) => {
      field.submit(PRESS_TICK, press('powerup.2'))
      const held = field.submit(PRESS_TICK + 1, intentToHoldSlot('powerup.2'))
      expect(verbsOf(field)).toEqual([VERBS[SWITCH].plain, VERBS[SWITCH].hold])
      expect(ofType(held, 'power-up-core.PowerUpUsed')).toMatchObject([
        { toggledOn: true, milestone: 'hold' },
      ])
      expect(powerUpStateOf(field.state(), 'p1').toggledOn).toEqual([SWITCH])
    })
  })
})

describe('Mark milestones: a follow-up with a sibling-link (#256)', () => {
  it("fires the sibling's plain use, not the follow-up's verb", () => {
    inMarkedField(9, (field) => {
      field.submit(2, intentToToggleLink(SWITCH))
      field.submit(PRESS_TICK, press('powerup.2'))
      field.submit(PRESS_TICK + 1, intentToToggleLink(SWITCH))
      field.submit(PRESS_TICK + 2, intentToHoldSlot('powerup.2'))
      expect(actsOf(field.state()).map(({ itemId, verb }) => [itemId, verb])).toEqual([
        [SWITCH, VERBS[SWITCH].plain],
        [SWITCH, VERBS[SWITCH].hold],
        [DASHER, VERBS[DASHER].plain],
      ])
    })
  })
})
