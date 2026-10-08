import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { AutoActor, AutoTarget } from '../../registries/autoActors'
import { autoLampOf } from '../../views/autoLamp'
import { tileOfPose, type VehiclePose } from '../../vehicle/vehiclePose'
import { vehicleOf } from '../authorityState'
import type { CommandIntent } from '../authorityCommand'
import { AUTO_OFF, AUTO_ON, AUTO_RIG, searSlice } from '../bore/boreAutoFixtures'
import { STEAM_SEAR_ITEM_ID } from '../bore/boreFire'
import { standInPocket } from '../bore/boreFixtures'
import { ofType } from '../charges/chargeFixtures'
import type { CommandRule } from '../commandRule'
import { createScriptedSession, dockInBay, type ScriptedSession } from '../scriptedSession'
import { autoModeOf } from './autoModeState'
import { autoToggleRefusal, switchAutoModeOff, switchAutoModeOn } from './autoToggle'

declare module '../authorityCommand' {
  interface CommandPayloads {
    'probe.set_shield_auto': { on: boolean }
  }
}

declare module '../domainEvent' {
  interface DomainEventBodies {
    'probe.ShieldRaised': { aim: number }
  }
}

/** A second self-acting item, as #328's alarm shield will be: its own flag, holds and act. */
const SHIELD_ITEM_ID = 'probe.alarm_shield'
const SHIELD_AIM = 7
const ON_TICK = 5

function shieldTargetOf(pose: VehiclePose | null): AutoTarget | null {
  return pose === null ? null : { aim: SHIELD_AIM, tile: tileOfPose(pose), energyQuanta: 0 }
}

const SHIELD_ACTOR: AutoActor = {
  id: 'probe.alarm-shield-auto',
  itemId: SHIELD_ITEM_ID,
  settingsOf: () => ({ previewTicks: 12, manualWaitTicks: 60, reserveAboveRescueBp: 1000 }),
  readyTickOf: () => 0,
  holdOf: () => null,
  bestTargetOf: (state, playerId) => shieldTargetOf(vehicleOf(state, playerId).pose),
  targetAlong: (state, playerId) => shieldTargetOf(vehicleOf(state, playerId).pose),
  holdAt: () => null,
  act: (state, _playerId, aim) => ({ state, events: [{ type: 'probe.ShieldRaised', aim }] }),
}

const SET_SHIELD_AUTO: CommandRule<'probe.set_shield_auto'> = {
  fields: { on: 'flag' },
  reject: (state, { playerId }) => autoToggleRefusal(state, playerId, SHIELD_ITEM_ID),
  apply: (state, { playerId, payload }) =>
    payload.on
      ? switchAutoModeOn(state, playerId, SHIELD_ITEM_ID)
      : switchAutoModeOff(state, playerId, SHIELD_ITEM_ID),
}

const SHIELD_ON: CommandIntent<'probe.set_shield_auto'> = {
  type: 'probe.set_shield_auto',
  payload: { on: true },
}

function shieldAndGunSlice() {
  return searSlice({
    researched: [STEAM_SEAR_ITEM_ID, SHIELD_ITEM_ID],
    extra: (r) => {
      r.autoActor(SHIELD_ACTOR)
      r.commandRules({ 'probe.set_shield_auto': SET_SHIELD_AUTO })
    },
  })
}

function bothOnAt(tick: number): ScriptedSession {
  const session = createScriptedSession()
  standInPocket(session, AUTO_RIG, 0)
  session.submit(tick, AUTO_ON)
  session.submit(tick, SHIELD_ON)
  return session
}

describe('auto mode core: a second item on its own id (ticket 317, GD lock on #206)', () => {
  it('locks and acts on its own preview, beside the bore gun', () =>
    withRegistrations([shieldAndGunSlice()], () => {
      const session = bothOnAt(ON_TICK)
      session.advanceTo(ON_TICK + 40)
      const locks = ofType(session.events(), 'AutoTargetLocked')
      const shield = locks.find(({ itemId }) => itemId === SHIELD_ITEM_ID)
      const gun = locks.find(({ itemId }) => itemId === STEAM_SEAR_ITEM_ID)
      expect(shield).toMatchObject({ tick: ON_TICK + 1, aim: SHIELD_AIM, actTick: ON_TICK + 13 })
      expect(gun).toMatchObject({ tick: ON_TICK + 1, actTick: ON_TICK + 11 })
      expect(ofType(session.events(), 'probe.ShieldRaised')[0]).toMatchObject({
        tick: ON_TICK + 13,
        aim: SHIELD_AIM,
      })
      expect(ofType(session.events(), 'BoreFired')).toHaveLength(1)
    }))

  it('keeps its own flag: switching the gun off leaves it on', () =>
    withRegistrations([shieldAndGunSlice()], () => {
      const session = bothOnAt(ON_TICK)
      session.submit(ON_TICK + 1, AUTO_OFF)
      expect(autoModeOf(session.state(), 'p1', STEAM_SEAR_ITEM_ID)).toBeNull()
      expect(autoModeOf(session.state(), 'p1', SHIELD_ITEM_ID)).not.toBeNull()
      expect(autoLampOf(session.state(), 'p1', SHIELD_ITEM_ID).colour).not.toBe('dark')
    }))

  it('meets the same shared holds: docked, it acts on nothing', () =>
    withRegistrations([shieldAndGunSlice()], () => {
      const session = bothOnAt(ON_TICK)
      dockInBay(session, ON_TICK, 'sell')
      session.advanceTo(ON_TICK + 60)
      expect(autoModeOf(session.state(), 'p1', SHIELD_ITEM_ID)?.hold).toBe('docked')
      expect(ofType(session.events(), 'probe.ShieldRaised')).toEqual([])
    }))

  it('is refused, spending nothing, while its own node is unresearched', () =>
    withRegistrations(
      [
        searSlice({
          extra: (r) => {
            r.autoActor(SHIELD_ACTOR)
            r.commandRules({ 'probe.set_shield_auto': SET_SHIELD_AUTO })
          },
        }),
      ],
      () => {
        const session = createScriptedSession()
        standInPocket(session, AUTO_RIG, 0)
        session.submit(ON_TICK, SHIELD_ON)
        expect(ofType(session.events(), 'CommandRejected')).toMatchObject([
          { reason: 'not_researched' },
        ])
        expect('autoModes' in session.state().players.p1).toBe(false)
      },
    ))
})
