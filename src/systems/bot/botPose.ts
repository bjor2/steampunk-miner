/**
 * The pose reports the bot sends (#11 amendments): a tile centre in integer mm, upright (the
 * body-up vector (0, 1024)), velocity 0, one of the four drill facings, and the action ticks since
 * the previous report, which the authority charges. Its drive (ticket 279) is the push its facing
 * stands for, as a player holding that one key: to the side when facing it, down when drilling
 * down, up when facing up; so drilling down the bot never pushes sideways and cuts straight.
 *
 * An aimed report (ticket 899) carries the head's aim in 1/64 turns as a player's analog stick
 * sends it (ticket 791): the facing nearest it, the aim itself only off the four facings, and the
 * push the aim stands for. A cardinal aim's report is the facing's report, field for field, so a
 * run that never aims off the four facings sends the very commands it sent before.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import type { CommandIntent } from '../authority/authorityCommand'
import { aimFieldsOf, aimOfFacing, type Aim } from '../vehicle/aim'
import { driveOfAim, driveOfFacing } from '../vehicle/driveSigns'
import { FACING, noseTileOf, type Facing, type VehiclePose } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'

export interface ActionTicks {
  thrustTicks: number
  driveTicks: number
  drillTicks: number
}

export const NO_TICKS: ActionTicks = { thrustTicks: 0, driveTicks: 0, drillTicks: 0 }

export function reportPoseIntent(
  tile: TilePoint,
  facing: Facing,
  ticks: ActionTicks = NO_TICKS,
): CommandIntent<'reportPose'> {
  return {
    type: 'reportPose',
    payload: {
      ...botPoseAt(tile, facing),
      driving: false,
      thrusting: false,
      drilling: ticks.drillTicks > 0,
      ...ticks,
      drive: driveOfFacing(facing),
    },
  }
}

export function facingTowards(from: TilePoint, to: TilePoint): Facing {
  if (to.tx > from.tx) return FACING.right
  if (to.tx < from.tx) return FACING.left
  return to.ty < from.ty ? FACING.down : FACING.up
}

/** The pose a report from `tile` facing `facing` gives the vehicle: the tile centre, upright, still. */
export function botPoseAt(tile: TilePoint, facing: Facing): VehiclePose {
  return {
    x: tile.tx * MM_PER_METRE + MM_PER_METRE / 2,
    y: tile.ty * MM_PER_METRE + MM_PER_METRE / 2,
    vx: 0,
    vy: 0,
    upx: 0,
    upy: UP_VECTOR_SCALE,
    facing,
  }
}

/** A report from `tile` with the head at `aim`: the facing's report on a cardinal aim. */
export function reportAimedPoseIntent(
  tile: TilePoint,
  aim: Aim,
  ticks: ActionTicks = NO_TICKS,
): CommandIntent<'reportPose'> {
  return {
    type: 'reportPose',
    payload: {
      ...botAimedPoseAt(tile, aim),
      driving: false,
      thrusting: false,
      drilling: ticks.drillTicks > 0,
      ...ticks,
      drive: driveOfAim(aim),
    },
  }
}

/** The pose a report from `tile` aimed at `aim` gives: `botPoseAt` with the aim's fields. */
export function botAimedPoseAt(tile: TilePoint, aim: Aim): VehiclePose {
  const fields = aimFieldsOf(aim)
  return { ...botPoseAt(tile, fields.facing), ...fields }
}

/**
 * The tile the drill bores next from `tile` with the head at `aim`: the player's nose tile, one
 * metre along the aim (ticket 791), so the bot never steps cells of its own.
 */
export function noseTileAlong(tile: TilePoint, aim: Aim): TilePoint {
  return noseTileOf(botAimedPoseAt(tile, aim))
}

/**
 * The aim from `from` to `to`: 45° when the step is as far across as up or down (ticket 899),
 * else the facing's aim, as `facingTowards` reads it.
 */
export function aimTowards(from: TilePoint, to: TilePoint): Aim {
  const across = Math.abs(to.tx - from.tx)
  if (across === 0 || across !== Math.abs(to.ty - from.ty)) {
    return aimOfFacing(facingTowards(from, to))
  }
  return diagonalAimOf(to.tx > from.tx, to.ty > from.ty)
}

/** The 45° aims, half way between the facings' (right 0, up 16, left 32, down 48). */
const DIAGONAL_AIMS = { upRight: 8, upLeft: 24, downLeft: 40, downRight: 56 } as const

function diagonalAimOf(isRight: boolean, isUp: boolean): Aim {
  if (isUp) return isRight ? DIAGONAL_AIMS.upRight : DIAGONAL_AIMS.upLeft
  return isRight ? DIAGONAL_AIMS.downRight : DIAGONAL_AIMS.downLeft
}
