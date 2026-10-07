/**
 * The drive a pose report carries (TD lock on #279): which way the player pushes, in the vehicle's
 * local frame, as signs only. `x` is the side (1 the local right, as `moveX`), `y` up or down (1
 * lifting, -1 drilling down). The twin bit's diagonal reads `x` (ticket 279); `y` is carried for
 * the items that read drive intent later (#255, #246, #204), so they need no second bump.
 *
 * A push counts only at least halfway to its side (Gameplay's rule on #279), so stick noise never
 * tilts the bit. The keys and today's stick push all the way; the rule holds for any analog source.
 */
import { DRIVE_PUSH_SHARE_MIN } from '../../constants/physics'
import type { VehicleIntent } from './vehicleIntent'
import { FACING } from './vehiclePose'

export type DriveSign = -1 | 0 | 1

export interface DriveSigns {
  x: DriveSign
  y: DriveSign
}

export const NO_DRIVE: DriveSigns = { x: 0, y: 0 }

const DRIVE_SIGNS: readonly unknown[] = [-1, 0, 1]

/** Exactly `x` and `y`, each -1, 0 or 1: anything else is refused, never rounded. */
export function isDriveSigns(value: unknown): value is DriveSigns {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value).sort()
  const { x, y } = value as Record<string, unknown>
  return keys.join() === 'x,y' && DRIVE_SIGNS.includes(x) && DRIVE_SIGNS.includes(y)
}

/** A push's sign: 0 below halfway to either side. */
export function signOfPush(push: number): DriveSign {
  if (push >= DRIVE_PUSH_SHARE_MIN) return 1
  return push <= -DRIVE_PUSH_SHARE_MIN ? -1 : 0
}

/** The drive of an intent: the side it drives to, and up while lifting or down while drilling down. */
export function driveSignsOfIntent(intent: VehicleIntent): DriveSigns {
  return { x: signOfPush(intent.moveX), y: verticalSignOf(intent) }
}

function verticalSignOf(intent: VehicleIntent): DriveSign {
  if (intent.lift) return 1
  return intent.facing === FACING.down ? -1 : 0
}
