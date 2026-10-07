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
 */
import type { AheadBearing } from '../economy/drillGearCaps'
import type { DiscStamp } from '../world/stampShape'
import type { TilePoint } from '../world/tileGrid'
import { drillGearCellsAt } from './drillGearCells'
import type { DriveSign, DriveSigns } from './driveSigns'
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

/**
 * The bearing the drive asks for: facing down, the facing's left is the vehicle's local right
 * (drive x 1, the tangent `perp(localUp)`), so driving right turns the cell to the facing's left.
 */
export function aheadBearingOfDrive(facing: Facing, driveX: DriveSign): AheadBearing {
  if (facing !== FACING.down || driveX === 0) return 'facing'
  return driveX === 1 ? 'left' : 'right'
}

/** The latch this cut digs with: the held one while its cell stands uncut, else the drive's. */
export function latchAheadBearing(
  latch: AheadLatch | null,
  bit: DrillBit,
  isUncut: (tile: TilePoint) => boolean,
): AheadLatch {
  if (latch !== null && isLatchHeld(latch, bit, isUncut)) return latch
  const bearing = aheadBearingOfDrive(bit.pose.facing, bit.drive.x)
  return { bearing, tile: firstAheadCellOf(bit, bearing) }
}

function isLatchHeld(
  latch: AheadLatch,
  bit: DrillBit,
  isUncut: (tile: TilePoint) => boolean,
): boolean {
  const cell = firstAheadCellOf(bit, latch.bearing)
  const isSameCell = cell.tx === latch.tile.tx && cell.ty === latch.tile.ty
  return isSameCell && isUncut(latch.tile)
}

function firstAheadCellOf(bit: DrillBit, bearing: AheadBearing): TilePoint {
  const reach = { aheadCells: 1, sideCells: 0, aheadBearing: bearing }
  return drillGearCellsAt(bit.pose, bit.disc, reach).ahead[0]
}
