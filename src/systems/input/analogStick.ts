/**
 * An analog stick as the vehicle's drive (ticket 791, overriding the #173 section 3 lock of 8
 * directions on the move actions): the touch stick and the pad's left stick both push in a
 * direction and by an amount, and that push becomes the intent itself, never four held actions.
 *
 * - **Aim:** the push's angle in whole 1/64 turns (`vehicle/aim.ts`), so sweeping the stick turns
 *   the drill smoothly, diagonals included. A push resting near a step's edge keeps the aim it had
 *   until it is `STICK_AIM_HOLD_STEPS` from it, so a thumb's tremor never flickers the head.
 * - **Drive:** `moveX` in 64ths of a full push, from 0 at the deadzone's edge to 64 at the rim, by
 *   the aim's share to the side. That share is read on the square the keys give (#40: a side key
 *   always drives at full speed), so a full push anywhere from straight sideways to the diagonal
 *   drives flat out, and the drive falls to 0 only toward straight up or down.
 * - **Lift:** the steam thruster fires while the push points more than an eighth of a turn above
 *   the horizontal, as the stick's old vertical octants did.
 *
 * Integer out, so what the fixed step drives with is the same on every machine (the intent is
 * client input; the authority hears the pose).
 */
import { STICK_AIM_HOLD_STEPS } from '../../constants/touch'
import { AIM_STEPS_PER_TURN, DRIVE_PUSH_STEPS } from '../../constants/physics'
import { aimDirectionOf, aimTurnOf, type Aim } from '../vehicle/aim'
import type { VehicleIntent } from '../vehicle/vehicleIntent'

/** A stick's push as shares of its travel: x right, y up, the rim at length 1. */
export interface StickPush {
  x: number
  y: number
}

/** What an analog stick drives with: the push's aim, its drive and whether it lifts. */
export interface StickDrive {
  moveX: number
  aim: Aim
  lift: boolean
}

/** The lift's floor: the sine of an eighth of a turn above the horizontal, at the 1024 scale. */
const LIFT_UP_MIN = 392
/** The diagonal's side share, `cos(1/8 turn)` at 1024: a push this far sideways drives flat out. */
const DIAGONAL_ALONG = 724

/**
 * The drive a push gives, or null inside the deadzone (a share of the travel). `heldAim` is the
 * aim the stick gave last, which a push near it keeps; null when it gave none.
 */
export function stickDriveOf(
  push: StickPush,
  deadzone: number,
  heldAim: Aim | null,
): StickDrive | null {
  const drive = { moveX: 0, aim: 0, lift: false }
  return stickDriveInto(push, deadzone, heldAim, drive) ? drive : null
}

/**
 * `stickDriveOf` written into `drive`, for a reader polled every frame (the pad), so nothing
 * allocates; whether the push is out of the deadzone. Inside it `drive` is left as it was.
 */
export function stickDriveInto(
  push: StickPush,
  deadzone: number,
  heldAim: Aim | null,
  drive: StickDrive,
): boolean {
  const length = Math.hypot(push.x, push.y)
  if (length < deadzone) return false
  const aim = heldOrNearestAim(stepsOfPush(push), heldAim)
  drive.moveX = driveOf(aim, pushShareOf(length, deadzone))
  drive.aim = aim
  drive.lift = isLiftingAim(aim)
  return true
}

/** The intent a stick's drive gives the fixed step. */
export function intentOfStick(drive: StickDrive): VehicleIntent {
  return { moveX: drive.moveX, aim: drive.aim, lift: drive.lift }
}

/** How far the push is from the deadzone's edge toward the rim, 0 to 1. */
function pushShareOf(length: number, deadzone: number): number {
  return Math.min(1, (length - deadzone) / (1 - deadzone))
}

/** The push's angle in fractional aim steps, 0 up to 64. */
function stepsOfPush({ x, y }: StickPush): number {
  const steps = (Math.atan2(y, x) / (2 * Math.PI)) * AIM_STEPS_PER_TURN
  return steps < 0 ? steps + AIM_STEPS_PER_TURN : steps
}

function heldOrNearestAim(steps: number, heldAim: Aim | null): Aim {
  if (heldAim !== null && Math.abs(stepsFrom(heldAim, steps)) <= STICK_AIM_HOLD_STEPS)
    return heldAim
  return Math.round(steps) % AIM_STEPS_PER_TURN
}

/** The signed fractional steps from an aim to an angle, the short way. */
function stepsFrom(aim: Aim, steps: number): number {
  const whole = Math.floor(steps)
  return aimTurnOf(aim, whole) + (steps - whole)
}

/** 64ths of a full drive: the push's share times the aim's side share on the keys' square. */
function driveOf(aim: Aim, share: number): number {
  const { along } = aimDirectionOf(aim)
  const squareShare = Math.min(1, Math.abs(along) / DIAGONAL_ALONG)
  const drive = Math.round(DRIVE_PUSH_STEPS * share * squareShare)
  return along < 0 ? 0 - drive : drive
}

function isLiftingAim(aim: Aim): boolean {
  return aimDirectionOf(aim).up > LIFT_UP_MIN
}
