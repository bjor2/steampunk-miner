import { beforeEach, describe, expect, it } from 'vitest'
import { pressAction, releaseAction, resetInput } from '../../../store/inputRuntime'
import { GROUND_GUN } from '../systems/groundGunEconomy'
import { clientRig, nextShotTickOfRig, playFrames, PRESS_TICK } from './clientRigFixtures'
import { advanceFire, FIRE_ACTION, resetFireInput } from './fireInput'

// The fire key or mouse button driven through the kernel's press path (ticket 314 on ticket 345,
// the TD lock on #314 section 2): the press asks the slice's input reaction, and each frame reads
// whether the key is still down. The rig faces right, so a key with no cursor fires east.

const TAP_BUFFER = GROUND_GUN.input.tapBufferTicks

const advanceFrame = () => advanceFire(null)

/** The tick the first shot's recovery ends, once its line has finished opening. */
function firstRecoveryEnd(): number {
  const run = clientRig()
  pressAction(FIRE_ACTION)
  releaseAction(FIRE_ACTION)
  playFrames(run, PRESS_TICK + 30, 60, advanceFrame)
  return nextShotTickOfRig(run)
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
      const run = clientRig()
      pressAction(FIRE_ACTION)
      playFrames(run, recoveryEnd + 2, framesPerSecond, advanceFrame)
      expect(recoveryEnd).toBeGreaterThan(PRESS_TICK + 45)
      expect(run.firedTicks).toEqual([PRESS_TICK, recoveryEnd])
      expect(run.refusals).toEqual([])
    },
  )

  it('sends each shot at most a tick late at 30 frames/s, with no refusal', () => {
    const recoveryEnd = firstRecoveryEnd()
    resetInput()
    resetFireInput()
    const run = clientRig()
    pressAction(FIRE_ACTION)
    playFrames(run, recoveryEnd + 2, 30, advanceFrame)
    expect(run.firedTicks).toHaveLength(2)
    expect(run.firedTicks[1] - recoveryEnd).toBeLessThanOrEqual(1)
    expect(run.refusals).toEqual([])
  })

  it('stops sending once the key comes up', () => {
    const run = clientRig()
    pressAction(FIRE_ACTION)
    playFrames(run, PRESS_TICK + 1, 60, advanceFrame)
    releaseAction(FIRE_ACTION)
    playFrames(run, PRESS_TICK + 600, 60, advanceFrame)
    expect(run.firedTicks).toEqual([PRESS_TICK])
  })

  it('sends and logs nothing with no gun mounted', () => {
    const run = clientRig(false)
    pressAction(FIRE_ACTION)
    playFrames(run, PRESS_TICK + 300, 60, advanceFrame)
    expect(run.submitted).toEqual([])
    expect(run.refusals).toEqual([])
  })
})

describe('ground-gun: an early press of the fire key', () => {
  it('fires a press the recovery lets through within the buffer, on the first allowed tick', () => {
    const recoveryEnd = firstRecoveryEnd()
    resetInput()
    resetFireInput()
    const run = clientRig()
    pressAction(FIRE_ACTION)
    releaseAction(FIRE_ACTION)
    playFrames(run, recoveryEnd - TAP_BUFFER, 60, advanceFrame)
    pressAction(FIRE_ACTION)
    releaseAction(FIRE_ACTION)
    playFrames(run, recoveryEnd + 2, 60, advanceFrame)
    expect(run.firedTicks).toEqual([PRESS_TICK, recoveryEnd])
    expect(run.refusals).toEqual([])
  })

  it('drops a press the recovery outlasts, silently', () => {
    const recoveryEnd = firstRecoveryEnd()
    resetInput()
    resetFireInput()
    const run = clientRig()
    pressAction(FIRE_ACTION)
    releaseAction(FIRE_ACTION)
    playFrames(run, recoveryEnd - TAP_BUFFER - 1, 60, advanceFrame)
    pressAction(FIRE_ACTION)
    releaseAction(FIRE_ACTION)
    playFrames(run, recoveryEnd + 60, 60, advanceFrame)
    expect(run.firedTicks).toEqual([PRESS_TICK])
    expect(run.refusals).toEqual([])
  })
})
