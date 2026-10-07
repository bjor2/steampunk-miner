import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../../logging/domainEventLog'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog } from '../../../logging/runLog'
import { runEventProblems } from '../../../logging/runEventSchema'
import { withRegistrations } from '../../../registries/registrar'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent, DomainEventBody } from '../../../systems/authority/domainEvent'
import { readSnapshot, takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { GROUND, type ScriptedSession } from '../../../systems/authority/scriptedSession'
import { fromSafeInteger, toCanonical } from '../../../systems/money'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import {
  BALLAST_COOLDOWN_TICKS,
  inLinkField,
  LINKED,
  MARK_2_PLANET,
  type LinkFieldSetup,
} from '../linkItems'
import { slice } from '../register'
import { chargesLeftOf, isLinkOn, itemChargesOf, powerUpStateOf } from './chargeState'
import { intentToToggleLink } from './linkToggle'
import { powerUpAtMarkOf } from './powerUpMarks'
import { fireSiblingLinkAt } from './siblingLink'
import { slotButtonsOf } from './slotColumn'
import { intentToUseSlot } from './slotUse'

// The sibling-link Mark milestone (the GD lock on #256, ticket 274) on fake linked items: from
// Mark 3 the boost's act fires the ballast in slot 2 at half strength, spending the ballast's own
// charge and cooldown, only while the link is on and the ballast is slotted and ready.

const PRESS_TICK = 10

const pressBoost = () => intentToUseSlot('powerup.1')

const walletOf = (session: ScriptedSession) => toCanonical(session.state().players.p1.wallet)

const linkLinesOf = (events: readonly DomainEventBody[]) =>
  events.filter((event) => event.type === 'power-up-core.LinkFired')

function ballastChargesOf(session: ScriptedSession): number {
  return chargesLeftOf(session.state(), 'p1', LINKED.ballast)
}

function setBallastCharges(session: ScriptedSession, tick: number, chargesLeft: number) {
  session.submit(tick, {
    type: 'debug.power-up-core.setCharges',
    payload: { itemId: LINKED.ballast, chargesLeft },
  } as CommandIntent)
}

/**
 * What the boost's press did: its log, the wallet and the boost's own charges after it. The log
 * leaves out the command's `seq`, which the switch-off command before it moves on by one.
 */
function boostPressIn(session: ScriptedSession) {
  const events = session.submit(PRESS_TICK, pressBoost())
  const boost = itemChargesOf(powerUpStateOf(session.state(), 'p1'), LINKED.boost)
  const log = JSON.stringify(events.map((event) => ({ ...event, seq: undefined })))
  return { log, wallet: walletOf(session), boost }
}

/** The boost pressed after `before`, with its link on, or switched off first. */
function pressAfter(
  before: (session: ScriptedSession) => void,
  setup: LinkFieldSetup & { isLinkOff?: boolean } = {},
) {
  return inLinkField((session) => {
    if (setup.isLinkOff) session.submit(2, intentToToggleLink(LINKED.boost))
    before(session)
    return boostPressIn(session)
  }, setup)
}

describe('power-up core: sibling-link', () => {
  it('when the link fires the sibling’s charge decrements, its cooldown starts and its tile flashes', () => {
    inLinkField((session) => {
      const ballast = powerUpAtMarkOf(session.state(), 'p1', LINKED.ballast)!
      const stack = ballastChargesOf(session)
      const events = session.submit(PRESS_TICK, pressBoost())
      expect(linkLinesOf(events)).toMatchObject([
        {
          tick: PRESS_TICK,
          type: 'power-up-core.LinkFired',
          playerId: 'p1',
          itemId: LINKED.boost,
          siblingId: LINKED.ballast,
          slot: 'powerup.2',
        },
      ])
      expect(ballastChargesOf(session)).toBe(stack - 1)
      expect(itemChargesOf(powerUpStateOf(session.state(), 'p1'), LINKED.ballast)).toMatchObject({
        readyAtTick: PRESS_TICK + BALLAST_COOLDOWN_TICKS,
        linkedAtTick: PRESS_TICK,
      })
      expect(slotButtonsOf(session.state(), 'p1')[1]).toMatchObject({
        itemId: LINKED.ballast,
        isLinkFlashing: true,
        cooldownPercent: 100,
        chargesLeft: stack - 1,
      })
      // The boost's coin, then the ballast's magnitude at half strength.
      const halfMagnitude = Math.floor((ballast.magnitude as number) / 2)
      expect(walletOf(session)).toBe(toCanonical(fromSafeInteger(1 + halfMagnitude)))
    })
  })

  it('fires the link of an item with its own moment then, never on its act', () => {
    inLinkField(
      (session) => {
        const stack = ballastChargesOf(session)
        const acted = session.submit(PRESS_TICK, pressBoost())
        expect(linkLinesOf(acted)).toEqual([])
        expect(ballastChargesOf(session)).toBe(stack)
        const moment = { playerId: 'p1', itemId: LINKED.curtain, tick: 40, origin: GROUND }
        const fired = fireSiblingLinkAt(session.state(), moment)
        expect(linkLinesOf(fired.events)).toMatchObject([
          { itemId: LINKED.curtain, siblingId: LINKED.ballast, slot: 'powerup.2' },
        ])
        expect(chargesLeftOf(fired.state, 'p1', LINKED.ballast)).toBe(stack - 1)
        expect(itemChargesOf(powerUpStateOf(fired.state, 'p1'), LINKED.ballast)).toMatchObject({
          readyAtTick: 40 + BALLAST_COOLDOWN_TICKS,
          linkedAtTick: 40,
        })
      },
      { slots: { 'powerup.1': LINKED.curtain, 'powerup.2': LINKED.ballast } },
    )
  })

  it('stops the flash after half a second, while the cooldown ring runs on', () => {
    inLinkField((session) => {
      session.submit(PRESS_TICK, pressBoost())
      session.advanceTo(PRESS_TICK + 29)
      expect(slotButtonsOf(session.state(), 'p1')[1].isLinkFlashing).toBe(true)
      session.advanceTo(PRESS_TICK + 30)
      const ballast = slotButtonsOf(session.state(), 'p1')[1]
      expect(ballast.isLinkFlashing).toBe(false)
      expect(ballast.cooldownPercent).toBeGreaterThan(0)
    })
  })

  it('with the sibling unslotted, empty or cooling down the main item’s effect and log are byte-identical to an unlinked use', () => {
    const unslotted = { slots: { 'powerup.1': LINKED.boost } }
    const empty = (session: ScriptedSession) => setBallastCharges(session, 3, 0)
    const coolingDown = (session: ScriptedSession) =>
      session.submit(5, intentToUseSlot('powerup.2'))
    const nothing = () => undefined
    expect(pressAfter(nothing, unslotted)).toEqual(
      pressAfter(nothing, { ...unslotted, isLinkOff: true }),
    )
    expect(pressAfter(empty)).toEqual(pressAfter(empty, { isLinkOff: true }))
    expect(pressAfter(coolingDown)).toEqual(pressAfter(coolingDown, { isLinkOff: true }))
    expect(pressAfter(coolingDown).log).not.toContain('LinkFired')
  })

  it('with the link toggled off no sibling charge is ever spent', () => {
    inLinkField((session) => {
      const stack = ballastChargesOf(session)
      session.submit(2, intentToToggleLink(LINKED.boost))
      session.submit(PRESS_TICK, pressBoost())
      session.submit(PRESS_TICK + 200, pressBoost())
      expect(ballastChargesOf(session)).toBe(stack)
      expect(linkLinesOf(session.events())).toEqual([])
      expect(walletOf(session)).toBe('2e+0')
    })
  })

  it('a milestone never yields a use without spending a charge', () => {
    inLinkField((session) => {
      const stack = ballastChargesOf(session)
      for (let press = 0; press < stack + 2; press += 1) {
        session.submit(PRESS_TICK + press * 200, pressBoost())
        session.advanceTo(PRESS_TICK + press * 200 + 100)
        refillBoost(session, PRESS_TICK + press * 200 + 150)
      }
      expect(linkLinesOf(session.events())).toHaveLength(stack)
      expect(ballastChargesOf(session)).toBe(0)
    })
    inLinkField(
      (session) => {
        const events = session.submit(PRESS_TICK, pressBoost())
        expect(linkLinesOf(events)).toEqual([])
        expect(powerUpStateOf(session.state(), 'p1').toggledOn).toEqual([])
        expect(walletOf(session)).toBe('1e+0')
      },
      { slots: { 'powerup.1': LINKED.horn, 'powerup.2': LINKED.lamp } },
    )
  })

  it('never fires a link to a sibling that is still a vision row', () => {
    inLinkField(
      (session) => {
        expect(linkLinesOf(session.submit(PRESS_TICK, pressBoost()))).toEqual([])
        expect(walletOf(session)).toBe('1e+0')
      },
      { slots: { 'powerup.1': LINKED.bell, 'powerup.2': LINKED.ballast } },
    )
  })

  it('fires nothing at Mark 2: the same press does the old thing', () => {
    inLinkField(
      (session) => {
        const stack = ballastChargesOf(session)
        expect(linkLinesOf(session.submit(PRESS_TICK, pressBoost()))).toEqual([])
        expect(ballastChargesOf(session)).toBe(stack)
        expect(slotButtonsOf(session.state(), 'p1')[0].link).toBeNull()
      },
      { researchedThrough: MARK_2_PLANET },
    )
  })

  it('costs and writes nothing when a gate refuses the sibling or it has nothing to act on', () => {
    const facings = [FACING.down, FACING.up]
    facings.forEach((facing) => {
      const linked = pressAfter(() => undefined, { facing })
      expect(linked).toEqual(pressAfter(() => undefined, { facing, isLinkOff: true }))
      expect(linked.log).not.toContain(LINKED.ballast)
    })
  })

  it('switches the link off and back on from the item card, saved per player', () => {
    inLinkField((session) => {
      expect(slotButtonsOf(session.state(), 'p1')[0].link).toEqual({
        siblingId: LINKED.ballast,
        siblingName: LINKED.ballast,
        isOn: true,
      })
      const off = session.submit(2, intentToToggleLink(LINKED.boost))
      expect(off).toMatchObject([{ type: 'power-up-core.LinkToggled', isOn: false }])
      const restored = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
      expect(
        'state' in restored && isLinkOn(powerUpStateOf(restored.state, 'p1'), LINKED.boost),
      ).toBe(false)
      session.submit(3, intentToToggleLink(LINKED.boost))
      expect(powerUpStateOf(session.state(), 'p1').linksOff).toBeUndefined()
      expect(linkLinesOf(session.submit(PRESS_TICK, pressBoost()))).toHaveLength(1)
    })
  })

  it('refuses to switch the link of an item whose Mark has reached none', () => {
    inLinkField(
      (session) => {
        const events = session.submit(2, intentToToggleLink(LINKED.boost))
        expect(events).toMatchObject([
          { type: 'CommandRejected', reason: 'power-up-core.no_sibling_link' },
        ])
      },
      { researchedThrough: MARK_2_PLANET },
    )
  })

  it('logs link_fired and link_toggled lines that keep their schema', () => {
    const events = inLinkField((session) => {
      session.submit(2, intentToToggleLink(LINKED.boost))
      session.submit(3, intentToToggleLink(LINKED.boost))
      session.submit(PRESS_TICK, pressBoost())
      return session.events()
    })
    const lines = linkLogLinesOf(events)
    expect(lines.map(({ event, data }) => ({ event, data }))).toEqual([
      { event: 'power-up-core.link_toggled', data: { itemId: LINKED.boost, isOn: false } },
      { event: 'power-up-core.link_toggled', data: { itemId: LINKED.boost, isOn: true } },
      {
        event: 'power-up-core.link_fired',
        data: { itemId: LINKED.boost, siblingId: LINKED.ballast, slot: 'powerup.2' },
      },
    ])
    lines.forEach((line) => expect(runEventProblems(line)).toEqual([]))
  })
})

/** The boost full again, as the dock refills it; the ballast's bought stack is left as it is. */
function refillBoost(session: ScriptedSession, tick: number) {
  const payload = { itemId: LINKED.boost, chargesLeft: 2 }
  session.submit(tick, { type: 'debug.power-up-core.setCharges', payload } as CommandIntent)
}

function linkLogLinesOf(events: readonly DomainEvent[]) {
  const sink = createMemorySink()
  const runLog = createRunLog({ runId: 'run_274', sink, secondsSinceStart: () => 0 })
  withRegistrations([slice], () =>
    recordDomainEventsTo(runLog, { playerId: 'p1', planet: 1, depthTiles: 0 }, events),
  )
  return sink.events.filter((line) => line.event.startsWith('power-up-core.link_'))
}
