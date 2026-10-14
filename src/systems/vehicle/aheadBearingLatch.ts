/**
 * Which way the twin bit's ahead cell points (GD lock on #257, TD lock and Gameplay's input rule on
 * #279): drilling down while the reported drive pushes to a side turns it 45 degrees toward that
 * side; anything else cuts along the facing. The bearing is latched when a cell's dig starts and
 * held until that cell is cut, so the bit never zig-zags inside one cell: a drive changed mid-cell
 * turns the next cell only.
 *
 * The latch holds while its cell is still the bit's first ahead cell on that bearing and still
 * stands uncut (not yet yielded, removable, no gate holding it). Once it is cut, refused, or the
 * bit has moved on, the next drill reads the drive again.
 *
 * Gear may allow an extra bearing (TD lock on #288, ticket 372): with `up` allowed, facing up
 * while the drive lifts and pushes to a side turns the cell 45 degrees up toward that side; up with
 * no side cuts along the facing (no straight-up turn). A latch on a bearing the gear no longer
 * allows drops at once, so the up-cut stops on the tick `up` goes and the next read is the facing.
 */
import type { AheadBearing, ExtraBearing } from '../economy/drillGearCaps'
import type { DiscStamp } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import { drillGearCellsAt } from './drillGearCells'
import type { DriveSigns } from './driveSigns'
import { sideOfPush } from './facedSide'
import { FACING, type Facing, type VehiclePose } from './vehiclePose'

/** The bearing a cell's dig started on, and that cell. */
export interface AheadLatch {
  bearing: AheadBearing
  tile: TilePoint
}

/** The drill as one reported cut sees it: the pose, its stamp and the drive reported with it. */
export interface DrillBit {
  pose: VehiclePose
  disc: DiscStamp
  drive: DriveSigns
}

/** Whether the drill's gear lets the drive turn the ahead cells to an extra bearing. */
export type AllowsBearing = (bearing: ExtraBearing) => boolean

/** What a latch reads beside the bit: whether a cell still stands uncut, and the gear's bearings. */
export interface AheadLatchRules {
  isUncut: (tile: TilePoint) => boolean
  allows: AllowsBearing
}

/**
 * The bearing the drive asks for: facing down, the facing's left is the vehicle's local right
 * (drive x 1, the tangent `perp(localUp)`), so driving right turns the cell to the facing's left.
 * Facing up, only with `up` allowed, lifting and a side pushed: the side the push crosses toward.
 */
export function aheadBearingOfDrive(
  facing: Facing,
  drive: DriveSigns,
  allows: AllowsBearing,
): AheadBearing {
  if (facing === FACING.down) return downBearingOf(drive)
  if (facing === FACING.up && isUpDiagonalAsked(drive, allows)) return upBearingOf(drive)
  return 'facing'
}

/** The latch this cut digs with: the held one while its cell stands uncut, else the drive's. */
export function latchAheadBearing(
  latch: AheadLatch | null,
  bit: DrillBit,
  rules: AheadLatchRules,
): AheadLatch {
  if (latch !== null && isLatchHeld(latch, bit, rules)) return latch
  const bearing = aheadBearingOfDrive(bit.pose.facing, bit.drive, rules.allows)
  return { bearing, tile: firstAheadCellOf(bit, bearing) }
}

/** The extra bearing a diagonal needs at a facing: `up` facing up, none elsewhere. */
export function extraBearingOf(facing: Facing, bearing: AheadBearing): ExtraBearing | null {
  return facing === FACING.up && bearing !== 'facing' ? 'up' : null
}

function downBearingOf(drive: DriveSigns): AheadBearing {
  if (drive.x === 0) return 'facing'
  return drive.x === 1 ? 'left' : 'right'
}

function isUpDiagonalAsked(drive: DriveSigns, allows: AllowsBearing): boolean {
  return allows('up') && drive.y === 1 && drive.x !== 0
}

function upBearingOf(drive: DriveSigns): AheadBearing {
  return sideOfPush(FACING.up, drive) ?? 'facing'
}

function isLatchHeld(latch: AheadLatch, bit: DrillBit, rules: AheadLatchRules): boolean {
  const cell = firstAheadCellOf(bit, latch.bearing)
  const isSameCell = cell.tx === latch.tile.tx && cell.ty === latch.tile.ty
  return isSameCell && isBearingStillAllowed(latch, bit, rules) && rules.isUncut(latch.tile)
}

function isBearingStillAllowed(latch: AheadLatch, bit: DrillBit, rules: AheadLatchRules): boolean {
  const extra = extraBearingOf(bit.pose.facing, latch.bearing)
  return extra === null || rules.allows(extra)
}

function firstAheadCellOf(bit: DrillBit, bearing: AheadBearing): TilePoint {
  const reach = { aheadCells: 1, sideCells: 0, aheadBearing: bearing }
  return drillGearCellsAt(bit.pose, bit.disc, reach).ahead[0]
}
