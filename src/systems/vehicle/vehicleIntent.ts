/**
 * The vehicle intent (#33 section 1, made analog by ticket 791): `{ moveX, aim, lift }` in the
 * vehicle's local frame, with no camera input, so camera angle and fixed-camera mode cannot change
 * it. `moveX` is the drive in 64ths of a full push (`DRIVE_PUSH_STEPS`), negative to the left; `aim`
 * the drill's aim in 1/64 turns (`aim.ts`), null when nothing is pushed. `buildIntent`
 * (`systems/input/buildIntent.ts`) makes it from the held actions of the action map, a key always
 * pushing in full and aiming at one of the four facings; an analog stick
 * (`systems/input/analogStick.ts`) from its push.
 */
import type { Aim } from './aim'

export interface VehicleIntent {
  moveX: number
  aim: Aim | null
  lift: boolean
}

export const IDLE_INTENT: VehicleIntent = { moveX: 0, aim: null, lift: false }
