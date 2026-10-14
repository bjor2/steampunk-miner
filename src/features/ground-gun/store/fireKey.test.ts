import { beforeEach, describe, expect, it } from 'vitest'
import { resetGameStore } from '../../../store/gameStore'
import { pressAction, releaseAction, resetInput } from '../../../store/inputRuntime'
import type { AuthorityCommand, CommandIntent } from '../../../systems/authority/authorityCommand'
import { PLAIN_RIG, standInPocket } from '../../../systems/authority/bore/boreFixtures'
import { nextShotTickOf } from '../../../systems/authority/bore/boreFire'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createLoopbackAuthority,
  type Authority,
} from '../../../systems/authority/loopbackAuthority'
import {
  createScriptedSession,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { onCurveSteps } from '../../../systems/economy/vehicleStats'
import { setUpgradeCommand } from '../../../systems/vehicle/vehicleCommands'
import { GROUND_GUN } from '../systems/groundGunEconomy'
import { mountedLevels } from '../systems/gunLevels'
import { advanceFire, FIRE_ACTION, hearFireRefusals, resetFireInput } from './fireInput'

// The fire key or mouse button driven through the kernel's press path (ticket 314 on ticket 345,
// the TD lock on #314 section 2): the press asks the slice's input reaction, and each frame reads
// whether the key is still down. The rig faces right, so a key with no cursor fires east.

const PRESS_TICK = 10
const TICKS_PER_SECOND = 60
const TAP_BUFFER = GROUND_GUN.input.tapBufferTicks
const FIRE_COMMAND = 'ground_gun.fire'

interface KeyRun {
  authority: Authority
  /** The ticks a fire was submitted at, and every refusal of one. */
  firedTicks: number[]
  refusals: string[]
  submitted: AuthorityCommand[]
}

/** The store's local player, whose replica the fire input reads. */
const PLAYER = 'player_1'

/** A planet-1 rig in band-1 rock with a planet-4 drill, the gun mounted or not. */
function rigAuthority(isMounted: boolean): Authority {
  const session = createScriptedSession([PLAYER])
  const asPlayer: ScriptedSession = {
    ...session,
    submit: (tick, intent) => session.submit(tick, intent, PLAYER),
  }
  if (isMounted) asPlayer.submit(0, setLevelsIntent())
  asPlayer.submit(0, setUpgradeCommand('drill_power', onCurveSteps(4).drill_power))
  standInPocket(asPlayer, PLAIN_RIG, 0)
  return createLoopbackAuthority(session.state())
}

function setLevelsIntent(): CommandIntent {
  return { type: 'debug.ground-gun.setLevels', payload: mountedLevels() }
}

/** The store on a spy of the rig's authority, the client hearing its refusals as the clock does. */
function keyRun(isMounted = true): KeyRun {
  const real = rigAuthority(isMounted)
  const run: KeyRun = { authority: real, firedTicks: [], refusals: [], submitted: [] }
  run.authority = {
    ...real,
    submit: (command) => {
      run.submitted.push(command)
      if (command.type === FIRE_COMMAND) run.firedTicks.push(command.tick)
      real.submit(command)
    },
  }
  real.subscribe((events) => hearRefusals(run, events))
  resetGameStore(run.authority)
  run.authority.advanceTo(PRESS_TICK)
  return run
}

function hearRefusals(run: KeyRun, events: readonly DomainEvent[]): void {
  events.forEach((event) => {
    if (event.type === 'CommandRejected' && event.commandType === FIRE_COMMAND)
      run.refusals.push(event.reason)
  })
  hearFireRefusals(events, PLAYER)
}

/** The client's frame loop to `toTick`: the authority moves on, then the fire input decides. */
function playFrames(run: KeyRun, toTick: number, framesPerSecond: number): void {
  const fromTick = run.authority.readState().tick
  for (let frame = 1; run.authority.readState().tick < toTick; frame++) {
    const tick = Math.min(
      toTick,
      fromTick + Math.floor((frame * TICKS_PER_SECOND) / framesPerSecond),
    )
    run.authority.advanceTo(tick)
    advanceFire(null)
  }
}

function nextShotTick(run: KeyRun): number {
  return nextShotTickOf(run.authority.readState(), PLAYER)
}

/** The tick the first shot's recovery ends, once its line has finished opening. */
function firstRecoveryEnd(): number {
  const run = keyRun()
  pressAction(FIRE_ACTION)
  releaseAction(FIRE_ACTION)
  playFrames(run, PRESS_TICK + 30, 60)
  return nextShotTick(run)
}

beforeEach(() => {
  resetInput()
  resetFireInput()
})

describe('ground-gun: holding the fire key', () => {
  it.each([60, 144])(
    'sends exactly one shot at each nextShotTick, with no refusal, at %i frames/s',
    (framesPerSecond) => {
      const recoveryEnd = firstRecoveryEnd()
      resetInput()
      resetFireInput()
      const run = keyRun()
      pressAction(FIRE_ACTION)
      playFrames(run, recoveryEnd + 2, framesPerSecond)
      expect(recoveryEnd).toBeGreaterThan(PRESS_TICK + 45)
      expect(run.firedTicks).toEqual([PRESS_TICK, recoveryEnd])
      expect(run.refusals).toEqual([])
    },
  )

  it('sends each shot at most a tick late at 30 frames/s, with no refusal', () => {
    const recoveryEnd = firstRecoveryEnd()
    resetInput()
    resetFireInput()
    const run = keyRun()
    pressAction(FIRE_ACTION)
    playFrames(run, recoveryEnd + 2, 30)
    expect(run.firedTicks).toHaveLength(2)
    expect(run.firedTicks[1] - recoveryEnd).toBeLessThanOrEqual(1)
    expect(run.refusals).toEqual([])
  })

  it('stops sending once the key comes up', () => {
    const run = keyRun()
    pressAction(FIRE_ACTION)
    playFrames(run, PRESS_TICK + 1, 60)
    releaseAction(FIRE_ACTION)
    playFrames(run, PRESS_TICK + 600, 60)
    expect(run.firedTicks).toEqual([PRESS_TICK])
  })

  it('sends and logs nothing with no gun mounted', () => {
    const run = keyRun(false)
    pressAction(FIRE_ACTION)
    playFrames(run, PRESS_TICK + 300, 60)
    expect(run.submitted).toEqual([])
    expect(run.refusals).toEqual([])
  })
})

describe('ground-gun: an early press of the fire key', () => {
  it('fires a press the recovery lets through within the buffer, on the first allowed tick', () => {
    const recoveryEnd = firstRecoveryEnd()
    resetInput()
    resetFireInput()
    const run = keyRun()
    pressAction(FIRE_ACTION)
    releaseAction(FIRE_ACTION)
    playFrames(run, recoveryEnd - TAP_BUFFER, 60)
    pressAction(FIRE_ACTION)
    releaseAction(FIRE_ACTION)
    playFrames(run, recoveryEnd + 2, 60)
    expect(run.firedTicks).toEqual([PRESS_TICK, recoveryEnd])
    expect(run.refusals).toEqual([])
  })

  it('drops a press the recovery outlasts, silently', () => {
    const recoveryEnd = firstRecoveryEnd()
    resetInput()
    resetFireInput()
    const run = keyRun()
    pressAction(FIRE_ACTION)
    releaseAction(FIRE_ACTION)
    playFrames(run, recoveryEnd - TAP_BUFFER - 1, 60)
    pressAction(FIRE_ACTION)
    releaseAction(FIRE_ACTION)
    playFrames(run, recoveryEnd + 60, 60)
    expect(run.firedTicks).toEqual([PRESS_TICK])
    expect(run.refusals).toEqual([])
  })
})
