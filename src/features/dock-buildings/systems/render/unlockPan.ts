/**
 * The unlock pan (#170 amendment "Look": the first landing after an unlock pans once across the
 * new building; TD lock on #197 Q4): camera only. From the pan's start tick the camera eases from
 * the car to the add-on's look point, rests on it, and eases back; the car is drawn where it is
 * and input is never held, so the player can drive off under it. A pure function of the tick, so
 * it is the same at any frame rate and touches no authority state, snapshot or digest. The
 * wiring (#222) starts it from the add-on's `FeatureUnlocked` event and never replays it after a
 * reload.
 */
import { TICKS_PER_SECOND } from '../../../../constants/physics'
import type { VehicleStaging } from '../../../../systems/registries/vehicleStaging'
import type { WorldPoint } from './buildingOrigin'
import { easeInOut, shareOf } from './easing'

/** The showcase camera's 24 ticks (#170), so the pan moves as the dock camera already does. */
export const PAN_IN_TICKS = 24
/** Rests on the new building for a second, long enough to read it. */
export const PAN_HOLD_TICKS = TICKS_PER_SECOND
export const PAN_OUT_TICKS = 24
export const PAN_TICKS = PAN_IN_TICKS + PAN_HOLD_TICKS + PAN_OUT_TICKS

export interface UnlockPan {
  startTick: number
  lookAt: WorldPoint
}

export function unlockPanStagingOf(tick: number, pan: UnlockPan): VehicleStaging | null {
  const elapsed = tick - pan.startTick
  if (elapsed < 0 || elapsed >= PAN_TICKS) return null
  return {
    drawOffsetX: 0,
    drawOffsetY: 0,
    cameraX: pan.lookAt.x,
    cameraY: pan.lookAt.y,
    cameraWeight: panWeightAt(elapsed),
    isHoldingInput: false,
    canLeaveByDriveHold: false,
  }
}

export function isUnlockPanOver(tick: number, pan: UnlockPan): boolean {
  return tick - pan.startTick >= PAN_TICKS
}

/** 0 on the car, 1 on the building: in over the first ticks, held, then back out. */
function panWeightAt(elapsed: number): number {
  if (elapsed < PAN_IN_TICKS) return easeInOut(shareOf(elapsed, PAN_IN_TICKS))
  const outElapsed = elapsed - PAN_IN_TICKS - PAN_HOLD_TICKS
  if (outElapsed < 0) return 1
  return 1 - easeInOut(shareOf(outElapsed, PAN_OUT_TICKS))
}
