import { describe, expect, it } from 'vitest'
import { fireAt, PLAIN_RIG, standInPocket } from '../../../systems/authority/bore/boreFixtures'
import { nextShotTickOf } from '../../../systems/authority/bore/boreFire'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { onCurveSteps } from '../../../systems/economy/vehicleStats'
import { feedbackCuesOf } from '../../../systems/feedback/feedbackCues'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { GROUND_GUN } from './groundGunEconomy'
import {
  fireStepAt,
  heldFire,
  IDLE_FIRE,
  isClankRefusal,
  refusedFire,
  releasedFire,
  tappedFire,
  type FireHold,
} from './fireHold'
import { mountedLevels } from './gunLevels'

const PRESS_TICK = 10
const FIRE_EAST_BEARING = 255
const TICKS_PER_SECOND = 60
const TAP_BUFFER = GROUND_GUN.input.tapBufferTicks

/** A planet-1 rig with the gun at its first levels and a planet-4 drill, in band-1 rock. */
function armedRig(): ScriptedSession {
  const session = createScriptedSession()
  const setLevels: CommandIntent = { type: 'debug.ground-gun.setLevels', payload: mountedLevels() }
  session.submit(0, setLevels)
  session.submit(0, setUpgradeCommand('drill_power', onCurveSteps(4).drill_power))
  standInPocket(session, PLAIN_RIG, 0)
  return session
}

interface ClientRun {
  session: ScriptedSession
  hold: FireHold
  /** The ticks a fire was sent at, and every refusal the authority answered. */
  firedTicks: number[]
  refusals: string[]
}

/** The client's frame loop: the authority moves on, then the hold decides, as `onFrame` runs it. */
function playFrames(run: ClientRun, toTick: number, framesPerSecond: number): void {
  const fromTick = run.session.state().tick
  for (let frame = 1; run.session.state().tick < toTick; frame++) {
    const tick = Math.min(
      toTick,
      fromTick + Math.floor((frame * TICKS_PER_SECOND) / framesPerSecond),
    )
    if (tick > run.session.state().tick) run.session.advanceTo(tick)
    playOneFrame(run, tick)
  }
}

function playOneFrame(run: ClientRun, tick: number): void {
  const step = fireStepAt(run.hold, tick, nextShotTickOf(run.session.state(), 'p1'))
  run.hold = step.hold
  if (step.shotBearing === null) return
  run.firedTicks.push(tick)
  const answered = run.session.submit(tick, fireAt(step.shotBearing))
  for (const reason of rejectionsOf(answered)) {
    run.refusals.push(reason)
    run.hold = refusedFire(run.hold, reason)
  }
}

/** Presses or taps at the session's tick, which sends at once when the gun allows, as the store does. */
function inputAt(run: ClientRun, hold: (current: FireHold, tick: number) => FireHold): void {
  const tick = run.session.state().tick
  run.hold = hold(run.hold, tick)
  playOneFrame(run, tick)
}

const pressEast = (hold: FireHold) => heldFire(hold, FIRE_EAST_BEARING)
const tapEast = (hold: FireHold, tick: number) => tappedFire(hold, FIRE_EAST_BEARING, tick)

function rejectionsOf(events: readonly DomainEvent[]): string[] {
  return events.flatMap((event) => (event.type === 'CommandRejected' ? [event.reason] : []))
}

function clientRun(session: ScriptedSession, hold: FireHold = IDLE_FIRE): ClientRun {
  return { session, hold, firedTicks: [], refusals: [] }
}

/** The tick the first shot's recovery ends, once its line has finished opening. */
function firstRecoveryEnd(framesPerSecond: number): number {
  const run = clientRun(armedRig())
  run.session.advanceTo(PRESS_TICK)
  inputAt(run, pressEast)
  playFrames(run, PRESS_TICK + 30, framesPerSecond)
  return nextShotTickOf(run.session.state(), 'p1')
}

describe('ground-gun: holding fire through a recovery (Gameplay on #313)', () => {
  it.each([60, 144])(
    'sends the next shot on the very tick nextShotTick allows, once, with no refusal at %i frames/s',
    (framesPerSecond) => {
      const recoveryEnd = firstRecoveryEnd(framesPerSecond)
      const run = clientRun(armedRig())
      run.session.advanceTo(PRESS_TICK)
      inputAt(run, pressEast)
      playFrames(run, recoveryEnd + 2, framesPerSecond)
      expect(recoveryEnd).toBeGreaterThan(PRESS_TICK + 45)
      expect(run.firedTicks).toEqual([PRESS_TICK, recoveryEnd])
      expect(run.refusals).toEqual([])
    },
  )

  it('sends it at most a tick late when frames come slower than ticks (30 frames/s)', () => {
    const recoveryEnd = firstRecoveryEnd(30)
    const run = clientRun(armedRig())
    run.session.advanceTo(PRESS_TICK)
    inputAt(run, pressEast)
    playFrames(run, recoveryEnd + 2, 30)
    expect(run.firedTicks).toHaveLength(2)
    expect(run.firedTicks[1] - recoveryEnd).toBeLessThanOrEqual(1)
    expect(run.refusals).toEqual([])
  })

  it('plays no clank for a held shot through a long recovery', () => {
    const run = clientRun(armedRig())
    run.session.advanceTo(PRESS_TICK)
    inputAt(run, pressEast)
    playFrames(run, PRESS_TICK + 400, 60)
    expect(feedbackCuesOf(run.session.events(), 'p1').map((cue) => cue.kind)).not.toContain(
      'boreClank',
    )
  })

  it('stops sending once released', () => {
    const run = clientRun(armedRig())
    run.session.advanceTo(PRESS_TICK)
    inputAt(run, pressEast)
    playFrames(run, PRESS_TICK + 1, 60)
    run.hold = releasedFire(run.hold)
    playFrames(run, PRESS_TICK + 600, 60)
    expect(run.firedTicks).toEqual([PRESS_TICK])
  })
})

describe('ground-gun: an early tap (Gameplay on #313)', () => {
  it('fires a tap the recovery lets through within the buffer, on the first allowed tick', () => {
    const recoveryEnd = firstRecoveryEnd(60)
    const run = clientRun(armedRig())
    run.session.advanceTo(PRESS_TICK)
    inputAt(run, tapEast)
    playFrames(run, recoveryEnd - TAP_BUFFER, 60)
    inputAt(run, tapEast)
    playFrames(run, recoveryEnd + 2, 60)
    expect(run.firedTicks).toEqual([PRESS_TICK, recoveryEnd])
    expect(run.refusals).toEqual([])
  })

  it('drops a tap the recovery outlasts, silently and without a refusal', () => {
    const recoveryEnd = firstRecoveryEnd(60)
    const run = clientRun(armedRig())
    run.session.advanceTo(PRESS_TICK)
    inputAt(run, tapEast)
    playFrames(run, recoveryEnd - TAP_BUFFER - 1, 60)
    inputAt(run, tapEast)
    playFrames(run, recoveryEnd + 60, 60)
    expect(run.firedTicks).toEqual([PRESS_TICK])
    expect(run.refusals).toEqual([])
  })
})

describe('ground-gun: refusals of a sent shot', () => {
  it('keeps a held gun held and silent through a recovering refusal', () => {
    const held = heldFire({ ...IDLE_FIRE, sentTick: 40 }, FIRE_EAST_BEARING)
    expect(isClankRefusal('recovering')).toBe(false)
    expect(refusedFire(held, 'recovering')).toEqual({ ...held, sentTick: null })
  })

  it('clanks any other refusal and lets the hold go, so it never clanks every tick', () => {
    const held = heldFire(IDLE_FIRE, FIRE_EAST_BEARING)
    expect(isClankRefusal('energy_short')).toBe(true)
    expect(refusedFire(held, 'energy_short')).toEqual({ ...IDLE_FIRE, bearing: FIRE_EAST_BEARING })
  })
})
