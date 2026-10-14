import { describe, expect, it } from 'vitest'
import { recordDomainEventsTo } from '../../../logging/domainEventLog'
import { createMemorySink } from '../../../logging/eventSink'
import { createRunLog } from '../../../logging/runLog'
import { runEventProblems } from '../../../logging/runEventSchema'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { vehicleOf } from '../../../systems/authority/authorityState'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { autoModeOf } from '../../../systems/authority/autoMode/autoModeState'
import { switchAutoModeOff, switchAutoModeOn } from '../../../systems/authority/autoMode/autoToggle'
import type { CommandRule } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  GROUND,
  poseAbove,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import type { AutoActor } from '../../../systems/registries/autoActors'
import { FACING, tileOfPose } from '../../../systems/vehicle/vehiclePose'
import { FAKE, FAKE_ITEMS } from '../fakeItems'
import { slice } from '../register'
import { autoUseReadyTickOf, POWER_UP_AUTO_AIM, pressItemOnAuto } from './autoPress'
import { chargesLeftOf } from './chargeState'
import { intentToUseSlot } from './slotUse'

// A self-acting item pressed by the kernel's auto mode core (ticket 328, the GD lock on #206
// decision 6, #317's rules): the press path a key takes, and a manual press that wins. The fake
// charged item (2 charges, a 6-tick wind-up, a 30-tick cooldown) has a cooldown shorter than the
// 60-tick override gap, so the gap shows on its own.

declare module '../../../systems/authority/authorityCommand' {
  interface CommandPayloads {
    'auto-probe.set_auto': { on: boolean }
  }
}

const ITEM = FAKE.charged
const OVERRIDE_GAP = 60
const COOLDOWN = 30
const WINDUP = 6
const PREVIEW = 10
const ON_TICK = 5

const AUTO_ACTOR: AutoActor = {
  id: 'auto-probe.charged-auto',
  itemId: ITEM,
  settingsOf: () => ({
    previewTicks: PREVIEW,
    manualWaitTicks: OVERRIDE_GAP,
    reserveAboveRescueBp: 1000,
  }),
  readyTickOf: (state, playerId) => autoUseReadyTickOf(state, playerId, ITEM),
  holdOf: () => null,
  bestTargetOf: (state, playerId) => ({
    aim: POWER_UP_AUTO_AIM,
    tile: tileOfPose(vehicleOf(state, playerId).pose!),
    energyQuanta: 0,
  }),
  targetAlong: (state, playerId) => AUTO_ACTOR.bestTargetOf(state, playerId),
  holdAt: () => null,
  act: (state, playerId, _aim, tick) => pressItemOnAuto(state, playerId, ITEM, tick),
}

const SET_AUTO: CommandRule<'auto-probe.set_auto'> = {
  fields: { on: 'flag' },
  apply: (state, { playerId, payload }) =>
    payload.on ? switchAutoModeOn(state, playerId, ITEM) : switchAutoModeOff(state, playerId, ITEM),
}

const AUTO_PROBE: SliceDefinition = {
  id: 'auto-probe',
  register(r) {
    r.autoActor(AUTO_ACTOR)
    r.commandRules({ 'auto-probe.set_auto': SET_AUTO })
  },
}

const AUTO_ON: CommandIntent<'auto-probe.set_auto'> = {
  type: 'auto-probe.set_auto',
  payload: { on: true },
}

const PRESS = intentToUseSlot('powerup.1')
const AUTO_FIRED_LINE = 'power-up-core.power_up_auto_fired'

function inAutoField<T>(isOn: boolean, body: (session: ScriptedSession) => T): T {
  return withRegistrations([slice, FAKE_ITEMS, AUTO_PROBE], () => {
    const session = createScriptedSession()
    session.submit(0, setVehicleLoadoutCommand({ 'powerup.1': ITEM }))
    session.submit(1, poseAbove(GROUND, FACING.right))
    if (isOn) session.submit(ON_TICK, AUTO_ON)
    return body(session)
  })
}

const ofType = (events: readonly DomainEvent[], type: string) =>
  events.filter((event) => event.type === type)

/** The first auto press: the lock on the tick after the switch, the act `PREVIEW` later. */
const FIRST_ACT = ON_TICK + 1 + PREVIEW

describe('power-up auto press', () => {
  it('presses the slot as a key would: a charge reserved, the wind-up, then the use', () =>
    inAutoField(true, (session) => {
      session.advanceTo(FIRST_ACT + WINDUP)
      expect(ofType(session.events(), 'power-up-core.PowerUpAutoFired')).toMatchObject([
        { tick: FIRST_ACT, itemId: ITEM, slot: 'powerup.1' },
      ])
      expect(ofType(session.events(), 'power-up-core.PowerUpUsed')).toMatchObject([
        { tick: FIRST_ACT + WINDUP, itemId: ITEM, chargesLeft: 1 },
      ])
      expect(autoUseReadyTickOf(session.state(), 'p1', ITEM)).toBe(FIRST_ACT + WINDUP + COOLDOWN)
    }))

  it('waits on the item: nothing while its use winds up, then not before its cooldown ends', () =>
    inAutoField(true, (session) => {
      session.advanceTo(FIRST_ACT + 1)
      expect(autoUseReadyTickOf(session.state(), 'p1', ITEM)).toBeNull()
      expect(autoModeOf(session.state(), 'p1', ITEM)?.hold).toBe('recovering')
      session.advanceTo(FIRST_ACT + WINDUP + COOLDOWN + PREVIEW + WINDUP)
      const fired = ofType(session.events(), 'power-up-core.PowerUpAutoFired')
      expect(fired.map(({ tick }) => tick)).toEqual([
        FIRST_ACT,
        FIRST_ACT + WINDUP + COOLDOWN + PREVIEW,
      ])
    }))

  it('logs power_up_auto_fired for the press, to its schema', () =>
    inAutoField(true, (session) => {
      session.advanceTo(FIRST_ACT)
      const sink = createMemorySink()
      const runLog = createRunLog({ runId: 'run_328', sink, secondsSinceStart: () => 0 })
      const stamp = { playerId: 'p1', planet: 1, depthTiles: 0 }
      recordDomainEventsTo(runLog, stamp, session.events())
      const fired = sink.events.filter(({ event }) => String(event) === AUTO_FIRED_LINE)
      expect(fired.map(({ data }) => data)).toEqual([{ itemId: ITEM, slot: 'powerup.1' }])
      expect(fired.flatMap(runEventProblems)).toEqual([])
    }))

  it('presses nothing, spending nothing, when a key press would be refused', () =>
    inAutoField(true, (session) => {
      session.submit(ON_TICK, {
        type: 'debug.power-up-core.setCharges',
        payload: { itemId: ITEM, chargesLeft: 0 },
      })
      session.advanceTo(FIRST_ACT + WINDUP)
      expect(ofType(session.events(), 'power-up-core.PowerUpAutoFired')).toEqual([])
      expect(ofType(session.events(), 'AutoActed')).toEqual([])
      expect(chargesLeftOf(session.state(), 'p1', ITEM)).toBe(0)
    }))
})

describe('power-up auto press: a manual press wins (#317 rules)', () => {
  it('drops the locked preview, and auto waits the override gap from the use', () =>
    inAutoField(true, (session) => {
      session.advanceTo(ON_TICK + 3)
      expect(autoModeOf(session.state(), 'p1', ITEM)?.preview).not.toBeNull()
      session.submit(ON_TICK + 3, PRESS)
      session.advanceTo(ON_TICK + 4)
      expect(autoModeOf(session.state(), 'p1', ITEM)?.preview).toBeNull()
      const used = ON_TICK + 3 + WINDUP
      session.advanceTo(used)
      expect(autoUseReadyTickOf(session.state(), 'p1', ITEM)).toBe(used + OVERRIDE_GAP)
      session.advanceTo(used + OVERRIDE_GAP + PREVIEW)
      expect(ofType(session.events(), 'power-up-core.PowerUpAutoFired')).toMatchObject([
        { tick: used + OVERRIDE_GAP + PREVIEW },
      ])
    }))

  it('keeps the cooldown of a use by hand as before while the item is off auto', () =>
    inAutoField(false, (session) => {
      session.submit(ON_TICK, PRESS)
      session.advanceTo(ON_TICK + WINDUP)
      expect(autoUseReadyTickOf(session.state(), 'p1', ITEM)).toBe(ON_TICK + WINDUP + COOLDOWN)
    }))

  it('takes the place of an auto press made in the same tick, with one charge spent', () =>
    inAutoField(true, (session) => {
      session.advanceTo(FIRST_ACT)
      session.submit(FIRST_ACT, PRESS)
      expect(ofType(session.events(), 'AutoActOverridden')).toMatchObject([
        { tick: FIRST_ACT, itemId: ITEM, aim: POWER_UP_AUTO_AIM },
      ])
      session.advanceTo(FIRST_ACT + WINDUP)
      expect(ofType(session.events(), 'power-up-core.PowerUpUsed')).toMatchObject([
        { tick: FIRST_ACT + WINDUP, chargesLeft: 1 },
      ])
      expect(autoUseReadyTickOf(session.state(), 'p1', ITEM)).toBe(
        FIRST_ACT + WINDUP + OVERRIDE_GAP,
      )
    }))
})
