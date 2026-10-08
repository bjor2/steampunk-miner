import { describe, expect, it } from 'vitest'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { WORLD_SEED } from '../../../systems/authority/scriptedSession'
import { replayRun } from '../../../systems/replay/replayRun'
import {
  CLAMP,
  CLAMP_COOLDOWN_TICKS,
  CLAMP_HOLD_TICKS,
  CLAMP_WINDUP_TICKS,
  clampNotesOf,
  inHoldField,
  withHoldItems,
  type HoldField,
} from '../fakeHoldItem'
import { itemChargesOf, powerUpStateOf } from './chargeState'
import type { PressableSlot } from './powerUpSlots'
import { intentToReleaseSlot, intentToUseSlot } from './slotUse'

// Letting go of a slot (ticket 332, the TD ruling on #285 section 3): `release_power_up` ends the
// live hold of an item used by holding it, and is otherwise accepted and changes nothing. The
// clamp in slot 1 winds up 6 ticks, then holds for 90; slot 2 holds an item with no `release`.

const PRESS_TICK = 10
const ACT_TICK = PRESS_TICK + CLAMP_WINDUP_TICKS
const HOLD_END_TICK = ACT_TICK + CLAMP_HOLD_TICKS

const press = (slot: PressableSlot) => intentToUseSlot(slot)
const release = (slot: PressableSlot) => intentToReleaseSlot(slot)

const ofType = (events: readonly DomainEvent[], type: string) =>
  events.filter((event) => event.type === type)

const readyAtTickOf = (field: HoldField) =>
  itemChargesOf(powerUpStateOf(field.state(), 'p1'), CLAMP).readyAtTick

/** The player as it is, but for the `seq` every accepted command moves on. */
function playerBesideSeq(field: HoldField) {
  const { lastSeq: _seq, ...player } = field.state().players.p1
  return player
}

function holdingFrom(field: HoldField): void {
  field.submit(PRESS_TICK, press('powerup.1'))
  field.advanceTo(ACT_TICK)
}

function expectNoOp(field: HoldField, tick: number, intent: CommandIntent): void {
  field.advanceTo(tick)
  const before = playerBesideSeq(field)
  expect(field.submit(tick, intent)).toEqual([])
  expect(playerBesideSeq(field)).toEqual(before)
}

describe('slot release: a live hold', () => {
  it('ends the hold on the release tick, calling release once with that tick', () => {
    inHoldField((field) => {
      holdingFrom(field)
      const events = field.submit(40, release('powerup.1'))
      expect(ofType(events, 'power-up-core.PowerUpReleased')).toEqual([
        {
          tick: 40,
          seq: expect.any(Number),
          type: 'power-up-core.PowerUpReleased',
          playerId: 'p1',
          itemId: CLAMP,
          slot: 'powerup.1',
        },
      ])
      expect(clampNotesOf(field.state())).toEqual({
        hold: null,
        endedAtTick: 40,
        releaseTicks: [40],
      })
    })
  })

  it('counts the cooldown from the release tick, not from the act', () => {
    inHoldField((field) => {
      holdingFrom(field)
      field.submit(40, release('powerup.1'))
      expect(readyAtTickOf(field)).toBe(40 + CLAMP_COOLDOWN_TICKS)
      const refused = field.submit(40 + CLAMP_COOLDOWN_TICKS - 1, press('powerup.1'))
      expect(refused).toMatchObject([{ reason: 'power-up-core.cooling_down' }])
      expect(field.submit(40 + CLAMP_COOLDOWN_TICKS, press('powerup.1'))).toEqual([])
    })
  })

  it('counts the cooldown from the hold end when the hold runs its length unreleased', () => {
    inHoldField((field) => {
      holdingFrom(field)
      field.advanceTo(HOLD_END_TICK + 5)
      expect(clampNotesOf(field.state())).toMatchObject({ hold: null, endedAtTick: HOLD_END_TICK })
      expect(clampNotesOf(field.state()).releaseTicks).toEqual([])
      expect(readyAtTickOf(field)).toBe(HOLD_END_TICK + CLAMP_COOLDOWN_TICKS)
    })
  })
})

describe('slot release: silent no-ops', () => {
  it('accepts a release of an empty slot and changes nothing', () => {
    inHoldField((field) => expectNoOp(field, 20, release('powerup.3')))
  })

  it('accepts a release of a slot whose item has no release, even mid-use', () => {
    inHoldField((field) => {
      field.submit(PRESS_TICK, press('powerup.2'))
      expectNoOp(field, PRESS_TICK + 1, release('powerup.2'))
    })
  })

  it('accepts a release with no live hold: before any use and after the hold ran out', () => {
    inHoldField((field) => {
      expectNoOp(field, 5, release('powerup.1'))
      holdingFrom(field)
      expectNoOp(field, HOLD_END_TICK, release('powerup.1'))
      expect(clampNotesOf(field.state()).releaseTicks).toEqual([])
    })
  })

  it('accepts a second release and changes nothing more', () => {
    inHoldField((field) => {
      holdingFrom(field)
      field.submit(40, release('powerup.1'))
      expectNoOp(field, 41, release('powerup.1'))
      expect(clampNotesOf(field.state()).releaseTicks).toEqual([40])
    })
  })

  it('rejects a slot no press reaches, and a slot that is not text', () => {
    inHoldField((field) => {
      expect(field.submit(20, release('powerup.9' as PressableSlot))).toMatchObject([
        { type: 'CommandRejected', reason: 'power-up-core.not_a_power_up_slot' },
      ])
      const malformed = {
        type: 'power-up-core.release_power_up',
        payload: { slot: 1 },
      } as unknown as CommandIntent
      expect(field.submit(21, malformed)).toMatchObject([{ type: 'CommandRejected' }])
    })
  })
})

describe('slot release: during the wind-up', () => {
  it('keeps the release on the pending use, with no event yet', () => {
    inHoldField((field) => {
      field.submit(PRESS_TICK, press('powerup.1'))
      expect(field.submit(PRESS_TICK + 2, release('powerup.1'))).toEqual([])
      expect(powerUpStateOf(field.state(), 'p1').pending).toMatchObject({
        itemId: CLAMP,
        releasedTick: PRESS_TICK + 2,
      })
    })
  })

  it('runs release on the act tick, right after the act', () => {
    inHoldField((field) => {
      field.submit(PRESS_TICK, press('powerup.1'))
      field.submit(PRESS_TICK + 2, release('powerup.1'))
      field.submit(PRESS_TICK + 3, release('powerup.1'))
      const events = field.advanceTo(ACT_TICK + 5)
      expect(
        events
          .filter((event) => event.type.startsWith('power-up-core.'))
          .map((event) => `${event.type}@${event.tick}`),
      ).toEqual([
        `power-up-core.PowerUpUsed@${ACT_TICK}`,
        `power-up-core.PowerUpReleased@${ACT_TICK}`,
      ])
      expect(clampNotesOf(field.state())).toEqual({
        hold: null,
        endedAtTick: ACT_TICK,
        releaseTicks: [ACT_TICK],
      })
      expect(readyAtTickOf(field)).toBe(ACT_TICK + CLAMP_COOLDOWN_TICKS)
    })
  })
})

describe('slot release: replay', () => {
  it('gives the same digests with the release logged, the clock jumped or at 30 and 144 steps/s', () => {
    inHoldField((field) => {
      holdingFrom(field)
      field.submit(40, release('powerup.1'))
      field.submit(41, release('powerup.1'))
      const endTick = 40 + CLAMP_COOLDOWN_TICKS
      const replays = [undefined, 30, 144].map((framesPerSecond) =>
        withHoldItems(() => replayRun(WORLD_SEED, field.commands, { endTick, framesPerSecond })),
      )
      const [jumped, ...framed] = replays.map((replay) => replay.digests)
      framed.forEach((digests) => expect(digests).toEqual(jumped))
      expect(clampNotesOf(replays[0].state)).toEqual(clampNotesOf(field.state()))
      expect(clampNotesOf(replays[0].state).releaseTicks).toEqual([40])
    })
  })
})
