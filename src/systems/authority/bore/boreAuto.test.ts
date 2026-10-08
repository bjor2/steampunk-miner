import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import type { SliceDefinition } from '../../../registries/sliceDefinition'
import type { BoreAutoShootStats } from '../../registries/boreGun'
import { AUTO_HOLD_REASONS, type AutoHoldReason } from '../../registries/autoActors'
import { AUTO_HOLD_LABELS, autoLampOf } from '../../views/autoLamp'
import { blockContaining, blockIdOf } from '../../world/collapseBlock'
import type { TilePoint } from '../../world/tileGrid'
import { advanceTicks } from '../advanceTicks'
import { applyCommand, kernelCommandTypes } from '../applyCommand'
import { autoModeOf, isAutoModeOn } from '../autoMode/autoModeState'
import { ofType } from '../charges/chargeFixtures'
import type { DomainEvent } from '../domainEvent'
import { createScriptedSession, dockInBay, type ScriptedSession } from '../scriptedSession'
import { readSnapshot, takeSnapshot } from '../sessionSnapshot'
import { stateDigest } from '../stateDigest'
import { BORE_BEARING_COUNT, clampedBearing, isBearingInArc } from './boreAim'
import { ARC_BEARINGS } from './boreAutoAim'
import { AUTO_OFF, AUTO_ON, AUTO_RIG, SEAR_STATS, searSlice } from './boreAutoFixtures'
import { nextShotTickOf, STEAM_SEAR_ITEM_ID } from './boreFire'
import { BORE_STATS, fireAt, FIRE_EAST, ORE_RIG, PLAIN_RIG, standInPocket } from './boreFixtures'

const ON_TICK = 5
/** Long enough for a lock, its preview, the shot and a little more. */
const LOOK_TICKS = 120
const STEP_RATES = [30, 144] as const
/**
 * A rate whose recovery through rock is short (`kGunPct` far above #322's 45), so the rate's own
 * 45-tick cooldown is the wait and the sear's 60 ticks after a manual shot can be seen past it.
 */
const QUICK_GUN = { stats: { ...BORE_STATS, kGunPct: 10000 } }

/** A planet-1 session with the rig standing in its pocket at `rig` and auto switched on. */
function autoAt(rig: TilePoint): ScriptedSession {
  const session = createScriptedSession()
  standInPocket(session, rig, 0)
  session.submit(ON_TICK, AUTO_ON)
  return session
}

function autoShotsOf(events: readonly DomainEvent[]) {
  return ofType(events, 'AutoActed')
}

function locksOf(events: readonly DomainEvent[]) {
  return ofType(events, 'AutoTargetLocked')
}

function holdOf(session: ScriptedSession): AutoHoldReason | null {
  return autoModeOf(session.state(), 'p1', STEAM_SEAR_ITEM_ID)?.hold ?? null
}

/** Moves the session to `toTick` in render frames of `stepsPerSecond`, as the live loop does. */
function advanceInFrames(session: ScriptedSession, toTick: number, stepsPerSecond: number): void {
  const fromTick = session.state().tick
  for (let frame = 1; session.state().tick < toTick; frame++) {
    const tick = Math.min(toTick, fromTick + Math.floor((frame * 60) / stepsPerSecond))
    if (tick > session.state().tick) session.advanceTo(tick)
  }
}

describe('bore gun auto: the toggle (ticket 317)', () => {
  it('is refused without the steam sear researched, and nothing changes', () =>
    withRegistrations([searSlice({ researched: [] })], () => {
      const session = createScriptedSession()
      standInPocket(session, AUTO_RIG, 0)
      const before = session.state()
      const command = {
        playerId: 'p1',
        tick: ON_TICK,
        seq: before.players.p1.lastSeq + 1,
        ...AUTO_ON,
      }
      const outcome = applyCommand(before, command)
      expect(ofType(outcome.events, 'CommandRejected')).toMatchObject([
        { reason: 'not_researched' },
      ])
      expect(outcome.state).toBe(before)
    }))

  it('starts off, survives a save and reload, and docking leaves it on', () =>
    withRegistrations([searSlice()], () => {
      const fresh = createScriptedSession()
      expect('autoModes' in fresh.state().players.p1).toBe(false)
      const session = autoAt(AUTO_RIG)
      const loaded = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
      if (!('state' in loaded) || loaded.problems.length > 0) throw new Error('refused')
      expect(isAutoModeOn(loaded.state, 'p1', STEAM_SEAR_ITEM_ID)).toBe(true)
      dockInBay(session, ON_TICK + 1, 'sell')
      session.advanceTo(ON_TICK + LOOK_TICKS)
      expect(isAutoModeOn(session.state(), 'p1', STEAM_SEAR_ITEM_ID)).toBe(true)
      expect(holdOf(session)).toBe('docked')
    }))

  it('switches off on its own command, leaving no autoModes key behind', () =>
    withRegistrations([searSlice()], () => {
      const session = autoAt(AUTO_RIG)
      session.submit(ON_TICK + 1, AUTO_OFF)
      expect(ofType(session.events(), 'AutoModeSet').map(({ isOn }) => isOn)).toEqual([true, false])
      expect('autoModes' in session.state().players.p1).toBe(false)
    }))
})

describe('bore gun auto: target and preview (ticket 317)', () => {
  it.each(STEP_RATES)(
    'shows its target 10 ticks before the shot and fires exactly that aim, at %i steps/s',
    (stepsPerSecond) =>
      withRegistrations([searSlice()], () => {
        const session = autoAt(AUTO_RIG)
        advanceInFrames(session, ON_TICK + LOOK_TICKS, stepsPerSecond)
        const [lock] = locksOf(session.events())
        const [fired] = ofType(session.events(), 'BoreFired')
        expect(lock.tick).toBe(ON_TICK + 1)
        expect(lock.actTick).toBe(lock.tick + SEAR_STATS.previewTicks)
        expect(fired).toMatchObject({ tick: lock.actTick, aimed: lock.aim, bearing: lock.aim })
        expect(autoShotsOf(session.events())[0]).toMatchObject({
          tick: lock.actTick,
          aim: lock.aim,
        })
      }),
  )

  it('keeps the locked preview in saved state until the act tick', () =>
    withRegistrations([searSlice()], () => {
      const session = autoAt(AUTO_RIG)
      session.advanceTo(ON_TICK + 1)
      const preview = autoModeOf(session.state(), 'p1', STEAM_SEAR_ITEM_ID)?.preview
      const [lock] = locksOf(session.events())
      expect(preview).toEqual({
        aim: lock.aim,
        tx: lock.tx,
        ty: lock.ty,
        lockedTick: lock.tick,
        actTick: lock.actTick,
      })
      session.advanceTo(lock.actTick - 1)
      expect(autoModeOf(session.state(), 'p1', STEAM_SEAR_ITEM_ID)?.preview).toEqual(preview)
      expect(ofType(session.events(), 'BoreFired')).toEqual([])
    }))

  it('never shortens the preview below 10 ticks, whatever the item answers', () =>
    withRegistrations([searSlice({ sear: { ...SEAR_STATS, previewTicks: 2 } })], () => {
      const session = autoAt(AUTO_RIG)
      session.advanceTo(ON_TICK + LOOK_TICKS)
      const [lock] = locksOf(session.events())
      expect(lock.actTick - lock.tick).toBe(10)
    }))

  it('aims at the ore it can reach, never at bare ground', () =>
    withRegistrations([searSlice()], () => {
      const session = autoAt(AUTO_RIG)
      session.advanceTo(ON_TICK + LOOK_TICKS)
      const [lock] = locksOf(session.events())
      const destroyed = ofType(session.events(), 'TileDestroyed')
      expect(destroyed).toContainEqual(
        expect.objectContaining({ tx: lock.tx, ty: lock.ty, kind: 'ore', cause: 'bore' }),
      )
    }))

  it('aims only at bearings inside the arc, never the excluded cone below the rig', () => {
    expect(ARC_BEARINGS).toHaveLength(172)
    expect(ARC_BEARINGS.every((bearing) => clampedBearing(bearing) === bearing)).toBe(true)
    const cone = Array.from({ length: BORE_BEARING_COUNT }, (_, b) => b).filter(
      (bearing) => !isBearingInArc(bearing),
    )
    expect(cone.some((bearing) => ARC_BEARINGS.includes(bearing))).toBe(false)
    withRegistrations([searSlice()], () => {
      const fired = [AUTO_RIG, ORE_RIG, { tx: AUTO_RIG.tx + 2, ty: AUTO_RIG.ty }].flatMap((rig) => {
        const session = autoAt(rig)
        session.advanceTo(ON_TICK + 4 * LOOK_TICKS)
        return ofType(session.events(), 'BoreFired')
      })
      expect(fired.length).toBeGreaterThan(0)
      expect(
        fired.every(({ aimed, bearing }) => aimed === bearing && isBearingInArc(bearing)),
      ).toBe(true)
    })
  })

  it('sends no aim to the authority: aiming without firing leaves the target and timing identical', () =>
    withRegistrations([searSlice()], () => {
      expect(kernelCommandTypes().filter((type) => type.startsWith('ground_gun.'))).toEqual([
        'ground_gun.fire',
        'ground_gun.set_auto',
      ])
      const plain = autoAt(AUTO_RIG)
      const aimed = autoAt(AUTO_RIG)
      // A refused out-of-range bearing is all a cursor could ever send, and it changes nothing.
      aimed.submit(ON_TICK + 2, fireAt(BORE_BEARING_COUNT))
      plain.advanceTo(ON_TICK + LOOK_TICKS)
      aimed.advanceTo(ON_TICK + LOOK_TICKS)
      const autoLines = (events: readonly DomainEvent[]) =>
        events.filter((event) => event.type !== 'CommandRejected')
      expect(autoLines(aimed.events())).toEqual(autoLines(plain.events()))
      expect(stateDigest(aimed.state())).toBe(stateDigest(plain.state()))
    }))
})

describe('bore gun auto: a manual shot wins (ticket 317)', () => {
  it('fires a manual shot on its own bearing, and auto fires nothing for the next 60 ticks', () =>
    withRegistrations([searSlice(QUICK_GUN)], () => {
      const session = autoAt(AUTO_RIG)
      session.advanceTo(ON_TICK + 3)
      const manualTick = ON_TICK + 3
      session.submit(manualTick, FIRE_EAST)
      session.advanceTo(manualTick + 3 * LOOK_TICKS)
      const [manual, ...later] = ofType(session.events(), 'BoreFired')
      expect(manual).toMatchObject({ tick: manualTick, aimed: FIRE_EAST.payload.bearing })
      expect(autoShotsOf(session.events()).every(({ tick }) => tick >= manualTick + 60)).toBe(true)
      expect(later.length).toBeGreaterThan(0)
      expect(later.every(({ tick }) => tick >= manualTick + 60)).toBe(true)
    }))

  it('folds the wait after a manual shot into its nextShotTick, the one clock', () =>
    withRegistrations([searSlice(QUICK_GUN)], () => {
      const session = autoAt(AUTO_RIG)
      session.submit(ON_TICK + 1, FIRE_EAST)
      session.advanceTo(ON_TICK + 20)
      expect(nextShotTickOf(session.state(), 'p1')).toBeGreaterThanOrEqual(ON_TICK + 1 + 60)
      session.advanceTo(ON_TICK + 30)
      expect(holdOf(session)).toBe('recovering')
    }))

  it('leaves a manual shot with auto off on the rate level wait alone', () =>
    withRegistrations([searSlice(QUICK_GUN)], () => {
      const session = createScriptedSession()
      standInPocket(session, AUTO_RIG, 0)
      session.submit(ON_TICK + 1, FIRE_EAST)
      session.advanceTo(ON_TICK + 20)
      expect(nextShotTickOf(session.state(), 'p1')).toBeLessThan(ON_TICK + 1 + 60)
    }))

  it('takes the place of an auto shot fired in the same tick, before it opened anything', () =>
    withRegistrations([searSlice()], () => {
      const session = autoAt(AUTO_RIG)
      session.advanceTo(ON_TICK + 1)
      const [lock] = locksOf(session.events())
      session.submit(lock.actTick, fireAt(0))
      expect(ofType(session.events(), 'AutoActOverridden')).toMatchObject([
        { tick: lock.actTick, itemId: STEAM_SEAR_ITEM_ID, aim: lock.aim },
      ])
      expect(session.state().bores).toHaveLength(1)
      expect(session.state().bores?.[0].autoAim).toBeUndefined()
      session.advanceTo(lock.actTick + 30)
      const bored = ofType(session.events(), 'TileDestroyed').filter(({ tx }) => tx <= AUTO_RIG.tx)
      expect(bored.length).toBeGreaterThan(0)
    }))

  it('lets a shot in flight finish on its own bearing when auto is switched off', () =>
    withRegistrations([searSlice()], () => {
      const session = autoAt(AUTO_RIG)
      session.advanceTo(ON_TICK + 1)
      const [lock] = locksOf(session.events())
      session.advanceTo(lock.actTick + 1)
      session.submit(lock.actTick + 1, AUTO_OFF)
      session.advanceTo(lock.actTick + 30)
      expect(ofType(session.events(), 'BoreEnded')).toMatchObject([{ stop: 'range' }])
    }))
})

/** A fake source that holds the rig to the wall, as the grav anchor's cling does. */
function anchoredSlice(): SliceDefinition {
  return searSlice({
    extra: (r) => r.vehicleMotionEffect({ id: 'probe.anchor', effectOf: () => ({ cling: true }) }),
  })
}

interface HoldCase {
  hold: AutoHoldReason
  slice: () => SliceDefinition
  rig: TilePoint
  /** What puts the hold on, after auto is switched on. */
  setUp?: (session: ScriptedSession) => void
}

const CAPPED_SEAR: BoreAutoShootStats = { ...SEAR_STATS, isIncomeCapUsed: true }

function forceRigBlock(session: ScriptedSession, rig: TilePoint): void {
  const block = blockIdOf(blockContaining({ xMm: rig.tx * 1000 + 500, yMm: rig.ty * 1000 + 500 }))
  session.submit(ON_TICK + 1, { type: 'debug.forceCollapse', payload: { block } })
}

const HOLD_CASES: readonly HoldCase[] = [
  {
    hold: 'docked',
    slice: () => searSlice(),
    rig: AUTO_RIG,
    setUp: (session) => dockInBay(session, ON_TICK + 1, 'sell'),
  },
  { hold: 'anchored', slice: anchoredSlice, rig: AUTO_RIG },
  {
    hold: 'collapse_warning',
    slice: () => searSlice(),
    rig: AUTO_RIG,
    setUp: (session) => forceRigBlock(session, AUTO_RIG),
  },
  { hold: 'unavailable', slice: () => searSlice({ sear: null }), rig: AUTO_RIG },
  {
    hold: 'recovering',
    slice: () => searSlice(),
    rig: AUTO_RIG,
    setUp: (session) => session.submit(ON_TICK + 1, FIRE_EAST),
  },
  { hold: 'income_cap', slice: () => searSlice({ sear: CAPPED_SEAR }), rig: AUTO_RIG },
  { hold: 'no_target', slice: () => searSlice(), rig: PLAIN_RIG },
  {
    hold: 'energy_reserve',
    slice: () => searSlice(),
    rig: AUTO_RIG,
    setUp: (session) =>
      session.submit(ON_TICK, { type: 'debug.setEnergy', payload: { energy: '50' } }),
  },
  { hold: 'would_warn', slice: () => searSlice(), rig: ORE_RIG },
]

describe('bore gun auto: holds (ticket 317)', () => {
  it.each(HOLD_CASES.map((holdCase) => [holdCase.hold, holdCase] as const))(
    'holds for %s with its own amber lamp, and fires nothing',
    (hold, { slice, rig, setUp }) =>
      withRegistrations([slice()], () => {
        const session = autoAt(rig)
        setUp?.(session)
        const shotsBefore = ofType(session.events(), 'BoreFired').length
        session.advanceTo(ON_TICK + 3 + Math.min(LOOK_TICKS, 40))
        expect(holdOf(session)).toBe(hold)
        expect(autoLampOf(session.state(), 'p1', STEAM_SEAR_ITEM_ID)).toMatchObject({
          colour: 'amber',
          hold,
        })
        expect(autoShotsOf(session.events())).toEqual([])
        expect(ofType(session.events(), 'BoreFired')).toHaveLength(shotsBefore)
      }),
  )

  it('covers every hold reason, each with its own label', () => {
    expect(HOLD_CASES.map(({ hold }) => hold).sort()).toEqual(
      AUTO_HOLD_REASONS.filter((hold) => hold !== 'inactive').sort(),
    )
    const labels = AUTO_HOLD_REASONS.map((hold) => AUTO_HOLD_LABELS[hold])
    expect(new Set(labels).size).toBe(AUTO_HOLD_REASONS.length)
  })

  it('shows a dark lamp while off and a green one while firing', () =>
    withRegistrations([searSlice()], () => {
      const session = createScriptedSession()
      standInPocket(session, AUTO_RIG, 0)
      expect(autoLampOf(session.state(), 'p1', STEAM_SEAR_ITEM_ID).colour).toBe('dark')
      session.submit(ON_TICK, AUTO_ON)
      session.advanceTo(ON_TICK + 1)
      expect(autoLampOf(session.state(), 'p1', STEAM_SEAR_ITEM_ID).colour).toBe('green')
    }))

  it('fires nothing on auto while the trip cap is used up, though a manual shot still fires', () =>
    withRegistrations([searSlice({ sear: CAPPED_SEAR })], () => {
      const session = autoAt(AUTO_RIG)
      session.advanceTo(ON_TICK + LOOK_TICKS)
      expect(autoShotsOf(session.events())).toEqual([])
      session.submit(ON_TICK + LOOK_TICKS, FIRE_EAST)
      expect(ofType(session.events(), 'BoreFired')).toHaveLength(1)
    }))

  it('picks up again once a hold lifts: undocked, it fires', () =>
    withRegistrations([searSlice()], () => {
      const session = autoAt(AUTO_RIG)
      dockInBay(session, ON_TICK + 1, 'sell')
      session.advanceTo(ON_TICK + 20)
      session.submit(ON_TICK + 20, { type: 'undock', payload: {} })
      standInPocket(session, AUTO_RIG, ON_TICK + 20)
      session.advanceTo(ON_TICK + 20 + LOOK_TICKS)
      expect(autoShotsOf(session.events()).length).toBeGreaterThan(0)
    }))
})

describe('bore gun auto: save and digest (ticket 317)', () => {
  it('round-trips a locked preview through a snapshot and fires the same shot after', () =>
    withRegistrations([searSlice()], () => {
      const session = autoAt(AUTO_RIG)
      session.advanceTo(ON_TICK + 4)
      const loaded = readSnapshot(JSON.parse(JSON.stringify(takeSnapshot(session.state()))))
      if (!('state' in loaded) || loaded.problems.length > 0) throw new Error('refused')
      const original = advanceTicks(session.state(), ON_TICK + LOOK_TICKS)
      const resumed = advanceTicks(loaded.state, ON_TICK + LOOK_TICKS)
      expect(autoShotsOf(original.events)).toHaveLength(1)
      expect(resumed.events).toEqual(original.events)
      expect(stateDigest(resumed.state)).toBe(stateDigest(original.state))
    }))

  it('digests the mode: a session on auto differs from one with it off', () =>
    withRegistrations([searSlice()], () => {
      const on = autoAt(PLAIN_RIG)
      on.submit(ON_TICK + 1, AUTO_OFF)
      on.submit(ON_TICK + 2, AUTO_ON)
      const off = autoAt(PLAIN_RIG)
      off.submit(ON_TICK + 1, AUTO_ON)
      off.submit(ON_TICK + 2, AUTO_OFF)
      expect(stateDigest(on.state())).not.toBe(stateDigest(off.state()))
    }))
})
