import { describe, expect, it } from 'vitest'
import {
  PAN_HOLD_TICKS,
  PAN_IN_TICKS,
  PAN_OUT_TICKS,
  PAN_TICKS,
  isUnlockPanOver,
  unlockPanStagingOf,
  type UnlockPan,
} from './unlockPan'

const PAN: UnlockPan = { startTick: 1000, lookAt: { x: 4.4, y: 309.3 } }

const weightAt = (tick: number) => unlockPanStagingOf(tick, PAN)?.cameraWeight

describe('unlock pan', () => {
  it('eases the camera onto the new building, rests on it, and eases back to the car', () => {
    expect(weightAt(PAN.startTick)).toBe(0)
    expect(weightAt(PAN.startTick + PAN_IN_TICKS / 2)).toBeGreaterThan(0)
    expect(weightAt(PAN.startTick + PAN_IN_TICKS / 2)).toBeLessThan(1)
    expect(weightAt(PAN.startTick + PAN_IN_TICKS)).toBe(1)
    expect(weightAt(PAN.startTick + PAN_IN_TICKS + PAN_HOLD_TICKS - 1)).toBe(1)
    const outMid = PAN.startTick + PAN_IN_TICKS + PAN_HOLD_TICKS + PAN_OUT_TICKS / 2
    expect(weightAt(outMid)).toBeGreaterThan(0)
    expect(weightAt(outMid)).toBeLessThan(1)
    expect(weightAt(PAN.startTick + PAN_TICKS - 1)).toBeLessThan(0.02)
  })

  it('looks at the add-on and moves only the camera: the car stays and input is never held', () => {
    const staging = unlockPanStagingOf(PAN.startTick + PAN_IN_TICKS, PAN)!
    expect(staging).toMatchObject({
      cameraX: PAN.lookAt.x,
      cameraY: PAN.lookAt.y,
      drawOffsetX: 0,
      drawOffsetY: 0,
      isHoldingInput: false,
      canLeaveByDriveHold: false,
    })
  })

  it('stages nothing before the pan starts or once it is over', () => {
    expect(unlockPanStagingOf(PAN.startTick - 1, PAN)).toBeNull()
    expect(unlockPanStagingOf(PAN.startTick + PAN_TICKS, PAN)).toBeNull()
    expect(isUnlockPanOver(PAN.startTick + PAN_TICKS - 1, PAN)).toBe(false)
    expect(isUnlockPanOver(PAN.startTick + PAN_TICKS, PAN)).toBe(true)
  })
})
