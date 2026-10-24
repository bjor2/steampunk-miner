/**
 * The drill's aim (ticket 791, overriding the #173 section 3 lock of 8 directions on the move
 * actions): an integer angle in 1/64 turns, counter-clockwise from the vehicle's local right, so
 * right is 0, up 16, left 32 and down 48. It lives in the vehicle's local frame (#7), like the
 * facing it refines, so the camera never changes it.
 *
 * The four facings of #7 are its cardinal aims (`aimOfFacing`): a pose or command that carries
 * only a facing, every log before protocol 107 among them, aims exactly as it did. The vector is
 * a 1024-scaled cosine table turned by the up vector, integer arithmetic only, so the authority
 * and a guest agree on every machine, and a cardinal aim gives the very vector `facingVectorOf`
 * gives.
 *
 * Nothing here imports `vehiclePose.ts` at run time, so the pose module can read the aim.
 */
import { AIM_STEPS_PER_TURN, UP_VECTOR_SCALE } from '../../constants/physics'
import type { Facing, IntegerVector } from './vehiclePose'

/** Steps of 1/64 turn from the local right, 0 to 63. */
export type Aim = number

/** The cardinal aims: where the four facings of #7 point. */
export const AIM = { right: 0, up: 16, left: 32, down: 48 } as const

const QUARTER_TURN = AIM_STEPS_PER_TURN / 4
const HALF_TURN = AIM_STEPS_PER_TURN / 2
const EIGHTH_TURN = AIM_STEPS_PER_TURN / 8

/**
 * `round(1024 cos(k / 64 turn))` for k = 0 to 16, the first quarter; the other three follow by
 * symmetry. Literal, so no machine's cosine can move a cut (the authority maths rule, #5).
 */
const QUARTER_COS = [
  1024, 1019, 1004, 980, 946, 903, 851, 792, 724, 650, 569, 483, 392, 297, 200, 100, 0,
] as const

/** Facing numbers as `vehiclePose.ts` has them: 0 left, 1 right, 2 down, 3 up (#33). */
const AIM_OF_FACING: readonly Aim[] = [AIM.left, AIM.right, AIM.down, AIM.up]

/** The local-frame direction of an aim at 1024: along the tangent (right +) and along `localUp`. */
export interface AimDirection {
  along: number
  up: number
}

export function isAim(value: unknown): value is Aim {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < AIM_STEPS_PER_TURN
}

export function aimOfFacing(facing: Facing): Aim {
  return AIM_OF_FACING[facing]
}

/**
 * The facing nearest the aim, for every rule that still reads one of the four (the gear, combat,
 * the slices): a diagonal halfway between two reads as its side, left or right.
 */
export function facingOfAim(aim: Aim): Facing {
  const turn = wrappedAim(aim)
  if (turn <= EIGHTH_TURN || turn >= AIM_STEPS_PER_TURN - EIGHTH_TURN) return 1
  if (turn >= HALF_TURN - EIGHTH_TURN && turn <= HALF_TURN + EIGHTH_TURN) return 0
  return turn < HALF_TURN ? 3 : 2
}

/** One of the four facings' aims exactly. */
export function isCardinalAim(aim: Aim): boolean {
  return wrappedAim(aim) % QUARTER_TURN === 0
}

/** Straight left or right: the level cut's aims (#36). */
export function isSidewaysAim(aim: Aim): boolean {
  return wrappedAim(aim) % HALF_TURN === 0
}

/** Straight down or up, along `localUp`: a bore's aims. */
export function isAlongUpAim(aim: Aim): boolean {
  return wrappedAim(aim) % HALF_TURN === QUARTER_TURN
}

/** Below the local horizontal: a cut with a downward share (#724's ramp reads it). */
export function isDownwardAim(aim: Aim): boolean {
  return wrappedAim(aim) > HALF_TURN
}

/** The aim's direction in the local frame, each part at the 1024 scale. */
export function aimDirectionOf(aim: Aim): AimDirection {
  return { along: cosineOf(aim), up: cosineOf(aim - QUARTER_TURN) }
}

/**
 * `cos * tangent + sin * localUp` at the up vector's 1024 scale, the tangent `(upy, -upx)` as
 * `facingVectorOf` has it; a cardinal aim's is that vector exactly.
 */
export function aimVectorOf(upx: number, upy: number, aim: Aim): IntegerVector {
  const turn = wrappedAim(aim)
  if (turn === AIM.right) return { x: upy, y: -upx }
  if (turn === AIM.up) return { x: upx, y: upy }
  if (turn === AIM.left) return { x: -upy, y: upx }
  if (turn === AIM.down) return { x: -upx, y: -upy }
  const { along, up } = aimDirectionOf(turn)
  return {
    x: unitScaled(along * upy + up * upx),
    y: unitScaled(up * upy - along * upx),
  }
}

/**
 * The signed turn from one aim to another the short way, in steps: -31 to 32, a half turn going
 * counter-clockwise as the drawn head does.
 */
export function aimTurnOf(from: Aim, to: Aim): number {
  const turn = wrappedAim(to - from)
  return turn > HALF_TURN ? turn - AIM_STEPS_PER_TURN : turn
}

/** A pose's aim: its own, or its facing's where it carries none (every pose before ticket 791). */
export function aimOfPose(pose: { facing: Facing; aim?: Aim }): Aim {
  return pose.aim ?? aimOfFacing(pose.facing)
}

/** The unit vector a pose aims along, at the 1024 scale. */
export function aimVectorOfPose(pose: {
  upx: number
  upy: number
  facing: Facing
  aim?: Aim
}): IntegerVector {
  return aimVectorOf(pose.upx, pose.upy, aimOfPose(pose))
}

/**
 * The pose's aim fields for `aim`: the facing nearest it, and the aim itself only where it is not
 * that facing's, so a cardinal pose stays the shape (and digest) it had before ticket 791.
 */
export function aimFieldsOf(aim: Aim): { facing: Facing; aim?: Aim } {
  const facing = facingOfAim(aim)
  return aimOfFacing(facing) === wrappedAim(aim) ? { facing } : { facing, aim: wrappedAim(aim) }
}

/** A product of two 1024-scaled parts back at 1024, rounded; never -0. */
function unitScaled(product: number): number {
  return Math.round(product / UP_VECTOR_SCALE) + 0
}

function cosineOf(aim: Aim): number {
  const turn = wrappedAim(aim)
  if (turn <= QUARTER_TURN) return QUARTER_COS[turn]
  // `0 -` rather than a minus sign, so a zero cosine is never -0.
  if (turn <= HALF_TURN) return 0 - QUARTER_COS[HALF_TURN - turn]
  if (turn <= HALF_TURN + QUARTER_TURN) return 0 - QUARTER_COS[turn - HALF_TURN]
  return QUARTER_COS[AIM_STEPS_PER_TURN - turn]
}

function wrappedAim(aim: Aim): Aim {
  return ((aim % AIM_STEPS_PER_TURN) + AIM_STEPS_PER_TURN) % AIM_STEPS_PER_TURN
}
