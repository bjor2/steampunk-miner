import { describe, expect, it } from 'vitest'
import { drillGearCellsAt } from './drillGearCells'
import { drillStampOf } from './drillStamp'
import { FACING, type Facing, type VehiclePose } from './vehiclePose'

// Where slice drill gear cuts, from the drill's stamp (ticket 234): just past the rim ahead and on
// each side of the bore, one cell apart.

/** At rest one cell above the tile (285, 30) on an upright planet, facing `facing`. */
function poseOver(facing: Facing): VehiclePose {
  return { x: 30500, y: 286500, vx: 0, vy: 0, upx: 0, upy: 1024, facing }
}

function cellsAt(facing: Facing, aheadCells: number, sideCells: number) {
  const pose = poseOver(facing)
  return drillGearCellsAt(pose, drillStampOf(pose, false), { aheadCells, sideCells })
}

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
})
