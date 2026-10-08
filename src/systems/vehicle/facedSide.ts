/**
 * The faced side (TD lock on #276): the one meaning of "the side you're steering toward" across the
 * bore, read by the side cutters' Mark 3 hold on the drill cut and by the terrain tools' faced-side
 * verbs (the ore-shifter's Mark 6 hold first). Sides are the facing's own: `left` is the facing
 * turned counter-clockwise on screen, as in `drillGearCellsAt`.
 *
 * The side comes from the drive component that crosses the bore (#279's reported drive, in the
 * vehicle's local frame): `drive.x` facing down or up, `drive.y` facing left or right. Facing down,
 * driving right names the facing's left, the same mapping as the twin bit's `aheadBearingOfDrive`.
 *
 * `facedSideOf` reads the latch the drill cut holds, else the crossing drive, else the seed taken
 * when the hold started, else the facing's right, so a hold always names exactly one side. The seed
 * is the facing at the hold's start when it pointed left or right (the authority keeps no last
 * horizontal facing, so no golden changes): the miner faced right, then dug down, so the right
 * flank cuts.
 *
 * Only the drill cut writes the latch (`latchFacedSide`), held per cell like the twin bit's: while
 * the bit's first cell along the facing still stands uncut, a stick wobble never flips the side;
 * on the next cell the crossing drive names it, and with no side pushed the latched side holds.
 */
import type { BoreSide } from '../economy/drillGearCaps'
import type { TilePoint } from '../world/tileGrid'
import type { DrillBit } from './aheadBearingLatch'
import { drillGearCellsAt } from './drillGearCells'
import { NO_DRIVE, type DriveSigns } from './driveSigns'
import { FACING, facingVectorOf, type IntegerVector, type VehiclePose } from './vehiclePose'

/** The side a drive-aimed side cut was latched to, and the bit's first cell it was latched on. */
export interface SideLatch {
  side: BoreSide
  tile: TilePoint
}

export const BORE_SIDES: readonly BoreSide[] = ['left', 'right']

/** What the vehicle remembers of its faced side: the drill cut's latch, absent before one. */
export interface FacedSideMemory {
  sideLatch?: SideLatch
}

/** The local frame's up: the facings as the vehicle sees them, before the planet turns them. */
const LOCAL_UP = { upx: 0, upy: 1 }

/** The faced side for this pose and drive; `seed` is the push the hold started with. */
export function facedSideOf(
  vehicle: FacedSideMemory,
  pose: Pick<VehiclePose, 'facing'>,
  drive: DriveSigns,
  seed: DriveSigns = NO_DRIVE,
): BoreSide {
  return (
    vehicle.sideLatch?.side ??
    sideOfPush(pose.facing, drive) ??
    sideOfPush(pose.facing, seed) ??
    'right'
  )
}

/**
 * The side a local push crosses the bore toward, or null when it pushes along the bore or not at
 * all: the sign of the push's component along the facing's left.
 */
export function sideOfPush(facing: VehiclePose['facing'], push: DriveSigns): BoreSide | null {
  const ahead = facingVectorOf(LOCAL_UP.upx, LOCAL_UP.upy, facing)
  const across = Math.sign(push.x * -ahead.y + push.y * ahead.x)
  if (across === 0) return null
  return across > 0 ? 'left' : 'right'
}

/** The hold-start seed: a push toward the facing when it points left or right, else none. */
export function sideSeedOf(pose: Pick<VehiclePose, 'facing'>): DriveSigns {
  if (pose.facing === FACING.left) return { x: -1, y: 0 }
  return pose.facing === FACING.right ? { x: 1, y: 0 } : NO_DRIVE
}

/** The world direction of a side of the bore at a pose, on the up-vector's 1024 scale. */
export function sideVectorOf(pose: VehiclePose, side: BoreSide): IntegerVector {
  const ahead = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return side === 'left' ? { x: -ahead.y, y: ahead.x } : { x: ahead.y, y: -ahead.x }
}

/**
 * The latch this cut digs with: the held one while its cell stands uncut, else the crossing
 * drive's side on the bit's new first cell, the held side kept while no side is pushed.
 */
export function latchFacedSide(
  vehicle: FacedSideMemory,
  bit: DrillBit,
  seed: DriveSigns,
  isUncut: (tile: TilePoint) => boolean,
): SideLatch {
  const tile = firstCellAlongFacingOf(bit)
  const latch = vehicle.sideLatch
  if (latch !== undefined && isSameTile(latch.tile, tile) && isUncut(tile)) return latch
  const side =
    sideOfPush(bit.pose.facing, bit.drive) ?? facedSideOf(vehicle, bit.pose, NO_DRIVE, seed)
  return { side, tile }
}

function firstCellAlongFacingOf(bit: DrillBit): TilePoint {
  return drillGearCellsAt(bit.pose, bit.disc, { aheadCells: 1, sideCells: 0 }).ahead[0]
}

function isSameTile(a: TilePoint, b: TilePoint): boolean {
  return a.tx === b.tx && a.ty === b.ty
}
