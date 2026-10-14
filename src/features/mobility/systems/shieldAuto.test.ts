import { describe, expect, it } from 'vitest'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import { advanceTicks } from '../../../systems/authority/advanceTicks'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { autoModeOf } from '../../../systems/authority/autoMode/autoModeState'
import { STEAM_SEAR_ITEM_ID } from '../../../systems/authority/bore/boreFire'
import {
  CORRIDOR_MIDDLE,
  prepareCorridor,
  spawnEnemy,
} from '../../../systems/authority/combat/combatFixtures'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  createScriptedSession,
  dockInBay,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { lungeWarningsOf } from '../../../systems/authority/sensingQueries'
import { readSnapshot, takeSnapshot } from '../../../systems/authority/sessionSnapshot'
import { stateDigest } from '../../../systems/authority/stateDigest'
import { ECONOMY } from '../../../systems/economy/economy'
import type { AutoHoldReason } from '../../../systems/registries/autoActors'
import type { ItemHook } from '../../../systems/registries/itemHooks'
import { AUTO_HOLD_LABELS, autoLampOf } from '../../../systems/views/autoLamp'
import { blockContaining, blockIdOf } from '../../../systems/world/collapseBlock'
import {
  chargesLeftOf,
  intentToUseSlot,
  powerUpAtMarkOf,
  withPowerUpCore,
} from '../../power-up-core'
import { slice as MOBILITY_SLICE } from '../register'
import { MOBILITY_ITEM } from './itemIds'
import { autoFiresOf } from './shieldAuto'

// The steam shield acting on its own (ticket 328, the GD lock on #206 decision 6, with #317's
// rules as Gameplay on #328 adds them): a fixture `autoFire` hook stands in for the alarm shield
// combo (206b). It fires only on a lunge warning, through the press path, after a 10-tick
// preview, inside the enemy's 24-tick wind-up; it holds for the rig's holds and the energy
// reserve, each with its lamp label; a manual press wins; the sear's toggle switches it.

const SHIELD = MOBILITY_ITEM.steamShield
const PREVIEW_TICKS = 10
const SHIELD_WINDUP_TICKS = 6
const ENEMY_WINDUP_TICKS = 24
const OVERRIDE_GAP_TICKS = 60
/** Long enough for a crawler three tiles off to wind up and lunge. */
const FIGHT_TICKS = 120

const SEAR_AUTO_ON: CommandIntent = { type: 'ground_gun.set_auto', payload: { on: true } }
const SEAR_AUTO_OFF: CommandIntent = { type: 'ground_gun.set_auto', payload: { on: false } }
const PRESS = intentToUseSlot('powerup.1')

/** A combo answering `fires` on the shield, as the alarm shield will. */
function alarmHookOf(fires: number): ItemHook {
  return {
    id: 'combo-fixture.alarm-shield',
    hook: 'autoFire',
    laneId: 'mobility',
    parentItemId: SHIELD,
    answer: () => fires,
  }
}

interface FixtureSetup {
  /** What the fixture hook answers; null registers no hook. */
  fires?: number | null
  researched?: readonly string[]
  extra?: (r: Parameters<SliceDefinition['register']>[0]) => void
}

function fixtureSliceOf({
  fires = 1,
  researched = [SHIELD, STEAM_SEAR_ITEM_ID],
  extra = () => {},
}: FixtureSetup): SliceDefinition {
  return {
    id: 'combo-fixture',
    register(r) {
      r.vehicleItemResearch({
        id: 'combo-fixture.research',
        isResearched: (_state, _playerId, itemId) => researched.includes(itemId),
      })
      if (fires !== null) r.itemHook(alarmHookOf(fires))
      extra(r)
    },
  }
}

function inFight<T>(setup: FixtureSetup, body: () => T): T {
  return withPowerUpCore([MOBILITY_SLICE, fixtureSliceOf(setup)], body)
}

/** The corridor fight with the shield in slot 1 and the sear's toggle switched on. */
function shieldOnAuto(slots: Readonly<Record<string, string>> = { 'powerup.1': SHIELD }) {
  const session = createScriptedSession()
  const start = prepareCorridor(session)
  session.submit(start, setVehicleLoadoutCommand(slots))
  session.submit(start, SEAR_AUTO_ON)
  return { session, start }
}

const spawnCrawler = (session: ScriptedSession, tick: number) =>
  session.submit(tick, spawnEnemy('crawler', 1, 3))

const ofType = (events: readonly DomainEvent[], type: string) =>
  events.filter((event) => event.type === type)

const shieldEvents = (session: ScriptedSession, type: string) =>
  ofType(session.events(), type).filter((event) => 'itemId' in event && event.itemId === SHIELD)

const autoFiredOf = (session: ScriptedSession) =>
  shieldEvents(session, 'power-up-core.PowerUpAutoFired')

/** Steps the clock until an enemy winds up on p1; that tick. */
function advanceToWindup(session: ScriptedSession, from: number): number {
  for (let tick = from + 1; tick <= from + FIGHT_TICKS; tick++) {
    session.advanceTo(tick)
    if (lungeWarningsOf(session.state(), 'p1', ECONOMY.itemHookCaps.reachCellsMax).length > 0) {
      return tick
    }
  }
  throw new Error('no enemy wound up')
}

const holdOf = (session: ScriptedSession) => autoModeOf(session.state(), 'p1', SHIELD)?.hold

describe('steam shield on auto: the trigger (ticket 328)', () => {
  it('locks on the first tick of a wind-up, acts 10 ticks later, and stands inside the 24', () =>
    inFight({}, () => {
      const { session, start } = shieldOnAuto()
      spawnCrawler(session, start)
      const windup = advanceToWindup(session, start)
      session.advanceTo(windup + PREVIEW_TICKS + SHIELD_WINDUP_TICKS)
      const [lock] = shieldEvents(session, 'AutoTargetLocked')
      expect(lock).toMatchObject({ tick: windup, actTick: windup + PREVIEW_TICKS })
      expect(autoFiredOf(session)).toMatchObject([{ tick: windup + PREVIEW_TICKS }])
      const [used] = shieldEvents(session, 'power-up-core.PowerUpUsed')
      expect(used.tick).toBe(windup + PREVIEW_TICKS + SHIELD_WINDUP_TICKS)
      expect(used.tick).toBeLessThan(windup + ENEMY_WINDUP_TICKS)
    }))

  it('never fires on a timer: with no enemy winding up it holds, firing nothing', () =>
    inFight({}, () => {
      const { session, start } = shieldOnAuto()
      session.advanceTo(start + 600)
      expect(holdOf(session)).toBe('no_target')
      expect(autoFiredOf(session)).toEqual([])
    }))

  it('never fires without a hook answering for the shield', () =>
    inFight({ fires: null }, () => {
      const { session, start } = shieldOnAuto()
      spawnCrawler(session, start)
      const windup = advanceToWindup(session, start)
      session.advanceTo(windup + FIGHT_TICKS)
      expect(autoFiredOf(session)).toEqual([])
    }))

  it('holds the fires to the warnings and to the charges left', () =>
    inFight({ fires: 5 }, () => {
      const { session, start } = shieldOnAuto()
      spawnCrawler(session, start)
      const windup = advanceToWindup(session, start)
      const warnings = lungeWarningsOf(session.state(), 'p1', ECONOMY.itemHookCaps.reachCellsMax)
      expect(warnings).toHaveLength(1)
      expect(autoFiresOf(session.state(), 'p1')).toBe(1)
      session.submit(windup, {
        type: 'debug.power-up-core.setCharges',
        payload: { itemId: SHIELD, chargesLeft: 0 },
      })
      expect(autoFiresOf(session.state(), 'p1')).toBe(0)
      session.advanceTo(windup + FIGHT_TICKS)
      expect(autoFiredOf(session)).toEqual([])
    }))
})

describe('steam shield on auto: the press path (ticket 328)', () => {
  it('spends its own charge and waits out its own cooldown before acting again', () =>
    inFight({}, () => {
      const { session, start } = shieldOnAuto()
      spawnCrawler(session, start)
      const windup = advanceToWindup(session, start)
      const used = windup + PREVIEW_TICKS + SHIELD_WINDUP_TICKS
      session.advanceTo(used)
      expect(chargesLeftOf(session.state(), 'p1', SHIELD)).toBe(1)
      const cooldown = powerUpAtMarkOf(session.state(), 'p1', SHIELD)!.cooldownTicks
      spawnCrawler(session, used + 1)
      session.advanceTo(used + 200)
      expect(holdOf(session)).toBe('recovering')
      expect(autoFiredOf(session)).toHaveLength(1)
      expect(cooldown).toBeGreaterThan(200)
    }))

  it('drops its queued act for a manual press, and fires nothing in the next 60 ticks', () =>
    inFight({}, () => {
      const { session, start } = shieldOnAuto()
      spawnCrawler(session, start)
      const windup = advanceToWindup(session, start)
      session.submit(windup + 2, PRESS)
      session.advanceTo(windup + 3)
      expect(autoModeOf(session.state(), 'p1', SHIELD)?.preview).toBeNull()
      spawnCrawler(session, windup + 3)
      session.advanceTo(windup + 2 + OVERRIDE_GAP_TICKS)
      expect(autoFiredOf(session)).toEqual([])
      expect(shieldEvents(session, 'power-up-core.PowerUpUsed')).toMatchObject([
        { tick: windup + 2 + SHIELD_WINDUP_TICKS },
      ])
    }))
})

/** A probe holding the rig to the wall, as the grav anchor's cling does. */
const ANCHORED: FixtureSetup = {
  extra: (r) =>
    r.vehicleMotionEffect({ id: 'combo-fixture.anchor', effectOf: () => ({ cling: true }) }),
}

function forceRigBlock(session: ScriptedSession, tick: number): void {
  const { tx, ty } = CORRIDOR_MIDDLE
  const block = blockIdOf(blockContaining({ xMm: tx * 1000 + 500, yMm: ty * 1000 + 500 }))
  session.submit(tick, { type: 'debug.forceCollapse', payload: { block } })
}

interface HoldCase {
  hold: AutoHoldReason
  setup?: FixtureSetup
  /** What puts the hold on before the crawler comes. */
  holdBy?: (session: ScriptedSession, tick: number) => void
  /** Whether the crawler winds up on the rig meanwhile: not on a docked one. */
  isWarned?: boolean
}

const HOLD_CASES: readonly HoldCase[] = [
  {
    hold: 'docked',
    holdBy: (session, tick) => dockInBay(session, tick, 'sell'),
    isWarned: false,
  },
  { hold: 'anchored', setup: ANCHORED },
  { hold: 'collapse_warning', holdBy: forceRigBlock },
  {
    hold: 'energy_reserve',
    holdBy: (session, tick) =>
      session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '1' } }),
  },
]

/** Every lamp the shield showed through the fight, and how many ticks an enemy wound up on p1. */
function watchFight(session: ScriptedSession, start: number) {
  const lamps: ReturnType<typeof autoLampOf>[] = []
  let warnedTicks = 0
  for (let tick = start + 1; tick <= start + FIGHT_TICKS; tick++) {
    session.advanceTo(tick)
    lamps.push(autoLampOf(session.state(), 'p1', SHIELD))
    if (lungeWarningsOf(session.state(), 'p1', ECONOMY.itemHookCaps.reachCellsMax).length > 0) {
      warnedTicks += 1
    }
  }
  return { lamps, warnedTicks }
}

describe('steam shield on auto: holds (ticket 328)', () => {
  it.each(HOLD_CASES.map((holdCase) => [holdCase.hold, holdCase] as const))(
    'holds for %s with its own amber lamp label, firing nothing',
    (hold, { setup = {}, holdBy, isWarned = true }) =>
      inFight(setup, () => {
        const { session, start } = shieldOnAuto()
        holdBy?.(session, start)
        spawnCrawler(session, start)
        const { lamps, warnedTicks } = watchFight(session, start)
        expect(lamps).toContainEqual({
          colour: 'amber',
          label: `Auto: ${AUTO_HOLD_LABELS[hold]}`,
          hold,
        })
        expect(warnedTicks > 0).toBe(isWarned)
        expect(autoFiredOf(session)).toEqual([])
      }),
  )

  it('still takes a manual press below the energy reserve', () =>
    inFight({}, () => {
      const { session, start } = shieldOnAuto()
      session.submit(start, { type: 'debug.setEnergy', payload: { energy: '1' } })
      spawnCrawler(session, start)
      const windup = advanceToWindup(session, start)
      session.advanceTo(windup + 1)
      expect(holdOf(session)).toBe('energy_reserve')
      session.submit(windup + 1, PRESS)
      session.advanceTo(windup + 1 + SHIELD_WINDUP_TICKS)
      expect(shieldEvents(session, 'power-up-core.PowerUpUsed')).toHaveLength(1)
      expect(autoFiredOf(session)).toEqual([])
    }))

  it('holds as not fitted while no slot holds the shield', () =>
    inFight({}, () => {
      const { session, start } = shieldOnAuto({})
      session.advanceTo(start + 2)
      expect(holdOf(session)).toBe('unavailable')
    }))
})

describe('steam shield on auto: one switch (ticket 328, Gameplay on #328)', () => {
  it('switches on and off with the sear toggle', () =>
    inFight({}, () => {
      const { session, start } = shieldOnAuto()
      expect(autoModeOf(session.state(), 'p1', SHIELD)).not.toBeNull()
      session.submit(start + 1, SEAR_AUTO_OFF)
      expect(autoModeOf(session.state(), 'p1', SHIELD)).toBeNull()
      expect(shieldEvents(session, 'AutoModeSet')).toMatchObject([{ isOn: true }, { isOn: false }])
    }))

  it('stays off while the shield node is unresearched', () =>
    inFight({ researched: [STEAM_SEAR_ITEM_ID] }, () => {
      const { session } = shieldOnAuto()
      expect(autoModeOf(session.state(), 'p1', STEAM_SEAR_ITEM_ID)).not.toBeNull()
      expect(autoModeOf(session.state(), 'p1', SHIELD)).toBeNull()
    }))
})

describe('steam shield on auto: host and guest (ticket 328)', () => {
  it('acts the same after a locked preview crosses a snapshot', () =>
    inFight({}, () => {
      const { session, start } = shieldOnAuto()
      spawnCrawler(session, start)
      const windup = advanceToWindup(session, start)
      const loaded = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
      if (!('state' in loaded) || loaded.problems.length > 0) throw new Error('refused')
      const host = advanceTicks(session.state(), windup + FIGHT_TICKS)
      const guest = advanceTicks(loaded.state, windup + FIGHT_TICKS)
      expect(ofType(host.events, 'power-up-core.PowerUpAutoFired')).toHaveLength(1)
      expect(guest.events).toEqual(host.events)
      expect(stateDigest(guest.state)).toBe(stateDigest(host.state))
    }))
})
