import { beforeEach, describe, expect, it } from 'vitest'
import { resetInput } from '../../../store/inputRuntime'
import { withRegistrations } from '../../../registries/registrar'
import { searSlice } from '../../../systems/authority/bore/boreAutoFixtures'
import { FIRE_TILE_FEEL } from '../systems/render/fireTileFeel'
import {
  clientRig,
  commandTypesOf,
  FIRE_COMMAND,
  nextShotTickOfRig,
  playFrames,
  PRESS_TICK,
} from './clientRigFixtures'
import { advanceFire, pressFireTile, releaseFireTile, resetFireInput } from './fireInput'
import { advanceFireLamp, pressFireLamp, releaseFireLamp, resetFireLamp } from './lampInput'

// The fire tile's lamp against its body (ticket 314, the GD's 3b ruling on #314), with the steam
// sear researched so auto-shoot can toggle: the kernel's sear probe stands in for the slice's gun.

const SET_AUTO = 'ground_gun.set_auto'
const HOLD_FIRE_TICKS = FIRE_TILE_FEEL.holdFireTicks
/** Four cells two ticks apart: the first line has ended well within this. */
const LINE_TICKS = 30

const advanceFrame = () => {
  advanceFire(null)
  advanceFireLamp()
}

beforeEach(() => {
  resetInput()
  resetFireInput()
  resetFireLamp()
})

describe('ground-gun: the fire tile lamp and body', () => {
  it('fires at cadence from a body held 30+ ticks and never toggles auto', () =>
    withRegistrations([searSlice()], () => {
      const rig = clientRig(false)
      pressFireTile()
      // The recovery is final once the first line has stopped opening cells.
      playFrames(rig, PRESS_TICK + HOLD_FIRE_TICKS + LINE_TICKS, 60, advanceFrame)
      const recoveryEnd = nextShotTickOfRig(rig)
      playFrames(rig, recoveryEnd + 2, 60, advanceFrame)
      releaseFireTile()
      expect(rig.firedTicks).toEqual([PRESS_TICK + HOLD_FIRE_TICKS, recoveryEnd])
      expect(commandTypesOf(rig)).not.toContain(SET_AUTO)
      expect(rig.refusals).toEqual([])
    }))

  it('toggles auto once from a 30-tick press on the lamp and sends no fire', () =>
    withRegistrations([searSlice()], () => {
      const rig = clientRig(false)
      pressFireLamp()
      playFrames(rig, PRESS_TICK + 90, 60, advanceFrame)
      releaseFireLamp()
      playFrames(rig, PRESS_TICK + 120, 60, advanceFrame)
      expect(commandTypesOf(rig)).toEqual([SET_AUTO])
      expect(rig.submitted[0]).toMatchObject({ tick: PRESS_TICK + 30, payload: { on: true } })
      expect(commandTypesOf(rig)).not.toContain(FIRE_COMMAND)
    }))

  it('does nothing for a short tap on the lamp', () =>
    withRegistrations([searSlice()], () => {
      const rig = clientRig(false)
      pressFireLamp()
      playFrames(rig, PRESS_TICK + 20, 60, advanceFrame)
      releaseFireLamp()
      playFrames(rig, PRESS_TICK + 120, 60, advanceFrame)
      expect(rig.submitted).toEqual([])
    }))
})
