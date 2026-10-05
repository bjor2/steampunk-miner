/**
 * The vehicle intent (#33 section 1): `{ moveX, facing, lift }` in the vehicle's local frame,
 * with no camera input, so camera angle and fixed-camera mode cannot change it.
 *
 * Until the action map and its rebinding arrive (Build 14, #34), the default keys of #33 map
 * straight to the intent here: A/D or arrows aim and drive left/right, S/W aim down/up, Space
 * lifts. The latest pushed aim sets the facing (#7 swivel rule) and a release keeps it.
 */
import { FACING, type Facing } from './vehiclePose'

export interface VehicleIntent {
  moveX: -1 | 0 | 1
  facing: Facing | null
  lift: boolean
}

const AIM_KEYS: Readonly<Record<string, Facing>> = {
  KeyA: FACING.left,
  ArrowLeft: FACING.left,
  KeyD: FACING.right,
  ArrowRight: FACING.right,
  KeyS: FACING.down,
  ArrowDown: FACING.down,
  KeyW: FACING.up,
  ArrowUp: FACING.up,
}

const LIFT_KEYS = ['Space']

export const IDLE_INTENT: VehicleIntent = { moveX: 0, facing: null, lift: false }

/** `held` lists the held key codes in the order they were pressed, the latest last. */
export function intentFromHeldKeys(held: readonly string[]): VehicleIntent {
  const aims = held.filter((code) => Object.hasOwn(AIM_KEYS, code)).map((code) => AIM_KEYS[code])
  return {
    moveX: moveOf(aims),
    facing: aims.length > 0 ? aims[aims.length - 1] : null,
    lift: held.some((code) => LIFT_KEYS.includes(code)),
  }
}

/** Left and right also drive (#33); of the two, the one pressed last wins. */
function moveOf(aims: readonly Facing[]): -1 | 0 | 1 {
  const sideways = aims.filter((facing) => facing === FACING.left || facing === FACING.right)
  if (sideways.length === 0) return 0
  return sideways[sideways.length - 1] === FACING.right ? 1 : -1
}
