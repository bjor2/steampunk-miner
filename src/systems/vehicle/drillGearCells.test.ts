import { describe, expect, it } from 'vitest'
import type { AheadBearing } from '../economy/drillGearCaps'
import { aheadBearingOfDrive, drillGearCellsAt } from './drillGearCells'
import { drillStampOf } from './drillStamp'
import { FACING, type Facing, type VehiclePose } from './vehiclePose'

// Where slice drill gear cuts, from the drill's stamp (ticket 234): just past the rim ahead and on
// each side of the bore, one cell apart.

/** At rest one cell above the tile (285, 30) on an upright planet, facing `facing`. */
function poseOver(facing: Facing): VehiclePose {
  return { x: 30500, y: 286500, vx: 0, vy: 0, upx: 0, upy: 1024, facing }
}

function cellsAt(
  facing: Facing,
  aheadCells: number,
  sideCells: number,
  aheadBearing: AheadBearing = 'facing',
) {
  const pose = poseOver(facing)
  return drillGearCellsAt(pose, drillStampOf(pose, false), { aheadCells, sideCells, aheadBearing })
}

/** Body-up vectors round the planet, 1024-scaled: upright, tilted both ways, and on its side. */
const UP_VECTORS = [
  { upx: 0, upy: 1024 },
  { upx: 724, upy: 724 },
  { upx: -400, upy: 943 },
  { upx: -1024, upy: 0 },
]
const FACINGS: readonly Facing[] = [FACING.left, FACING.right, FACING.down, FACING.up]
const DIAGONALS: readonly AheadBearing[] = ['left', 'right']

describe('drill gear cells', () => {
  it('lists nothing when the gear adds no cell', () => {
    expect(cellsAt(FACING.down, 0, 0)).toEqual({ ahead: [], side: [] })
  })

  it('puts the reach boom cell just past the bit along the facing', () => {
    expect(cellsAt(FACING.down, 1, 0).ahead).toEqual([{ tx: 30, ty: 284 }])
  })

  it('puts a side cell on each side of the bore, level with the stamp, one side first', () => {
    expect(cellsAt(FACING.down, 0, 1).side).toEqual([
      { tx: 31, ty: 286 },
      { tx: 29, ty: 286 },
    ])
  })

  it('lists wider side cells nearest first, alternating sides', () => {
    expect(cellsAt(FACING.down, 0, 2).side).toEqual([
      { tx: 31, ty: 286 },
      { tx: 29, ty: 286 },
      { tx: 32, ty: 286 },
      { tx: 28, ty: 286 },
    ])
  })

  it('turns with the facing: a level cut facing right widens above and below its raised stamp', () => {
    const cells = cellsAt(FACING.right, 1, 1)
    expect(cells.ahead).toEqual([{ tx: 32, ty: 286 }])
    expect(cells.side).toEqual([
      { tx: 31, ty: 288 },
      { tx: 31, ty: 285 },
    ])
  })

  it("the twin bit's diagonal cell replaces the ahead cell, so the cut lists one ahead cell", () => {
    // Facing down on an upright planet the facing's left is screen-right.
    expect(cellsAt(FACING.down, 1, 0, 'left').ahead).toEqual([{ tx: 31, ty: 284 }])
    expect(cellsAt(FACING.down, 1, 0, 'right').ahead).toEqual([{ tx: 29, ty: 284 }])
    expect(cellsAt(FACING.down, 1, 1, 'left').ahead).toHaveLength(1)
  })

  it("puts the diagonal cell one column beside the facing's cell, in the same row", () => {
    const [straight] = cellsAt(FACING.down, 1, 0).ahead
    const [diagonal] = cellsAt(FACING.down, 1, 0, 'right').ahead
    expect(diagonal).toEqual({ tx: straight.tx - 1, ty: straight.ty })
  })

  it("turns a level cut's ahead cell up or down a row with the bearing", () => {
    expect(cellsAt(FACING.right, 1, 0, 'left').ahead).toEqual([{ tx: 32, ty: 287 }])
    expect(cellsAt(FACING.right, 1, 0, 'right').ahead).toEqual([{ tx: 32, ty: 285 }])
  })

  it('the diagonal cell is never listed among the side cells', () => {
    for (const up of UP_VECTORS) {
      for (const facing of FACINGS) {
        for (const aheadBearing of DIAGONALS) {
          for (let sideCells = 1; sideCells <= 3; sideCells++) {
            const pose = { ...poseOver(facing), ...up }
            const gear = { aheadCells: 1, sideCells, aheadBearing }
            const cells = drillGearCellsAt(pose, drillStampOf(pose, false), gear)
            expect(cells.ahead).toHaveLength(1)
            expect(cells.side).not.toContainEqual(cells.ahead[0])
          }
        }
      }
    }
  })

  it('turns the ahead cell toward the side driven while drilling down, and only then', () => {
    expect(aheadBearingOfDrive(FACING.down, 1)).toBe('left')
    expect(aheadBearingOfDrive(FACING.down, -1)).toBe('right')
    expect(aheadBearingOfDrive(FACING.down, 0)).toBe('facing')
    for (const facing of [FACING.left, FACING.right, FACING.up]) {
      expect(aheadBearingOfDrive(facing, 1)).toBe('facing')
      expect(aheadBearingOfDrive(facing, -1)).toBe('facing')
    }
  })

  it('cuts the diagonal on the screen side the vehicle drives toward', () => {
    const [driveRight] = cellsAt(FACING.down, 1, 0, aheadBearingOfDrive(FACING.down, 1)).ahead
    const [driveLeft] = cellsAt(FACING.down, 1, 0, aheadBearingOfDrive(FACING.down, -1)).ahead
    const [straight] = cellsAt(FACING.down, 1, 0).ahead
    expect(driveRight.tx).toBe(straight.tx + 1)
    expect(driveLeft.tx).toBe(straight.tx - 1)
  })
})
