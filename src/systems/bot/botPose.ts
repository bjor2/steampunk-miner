/**
 * The pose reports the bot sends (#11 amendments): a tile centre in integer mm, upright (the
 * body-up vector (0, 1024)), velocity 0, one of the four drill facings, and the action ticks since
 * the previous report, which the authority charges. Its drive (ticket 279) is the push its facing
 * stands for, as a player holding that one key: to the side when facing it, down when drilling
 * down, up when facing up; so drilling down the bot never pushes sideways and cuts straight.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import type { CommandIntent } from '../authority/authorityCommand'
import type { DriveSigns } from '../vehicle/driveSigns'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'

export interface ActionTicks {
  thrustTicks: number
  driveTicks: number
  drillTicks: number
}

export const NO_TICKS: ActionTicks = { thrustTicks: 0, driveTicks: 0, drillTicks: 0 }

const DRIVE_OF_FACING: Readonly<Record<Facing, DriveSigns>> = {
  [FACING.left]: { x: -1, y: 0 },
  [FACING.right]: { x: 1, y: 0 },
  [FACING.down]: { x: 0, y: -1 },
  [FACING.up]: { x: 0, y: 1 },
}

export function reportPoseIntent(
  tile: TilePoint,
  facing: Facing,
  ticks: ActionTicks = NO_TICKS,
): CommandIntent<'reportPose'> {
  return {
    type: 'reportPose',
    payload: {
      x: tile.tx * MM_PER_METRE + MM_PER_METRE / 2,
      y: tile.ty * MM_PER_METRE + MM_PER_METRE / 2,
      vx: 0,
      vy: 0,
      upx: 0,
      upy: UP_VECTOR_SCALE,
      facing,
      driving: false,
      thrusting: false,
      drilling: ticks.drillTicks > 0,
      ...ticks,
      drive: DRIVE_OF_FACING[facing],
    },
  }
}

export function facingTowards(from: TilePoint, to: TilePoint): Facing {
  if (to.tx > from.tx) return FACING.right
  if (to.tx < from.tx) return FACING.left
  return to.ty < from.ty ? FACING.down : FACING.up
}
