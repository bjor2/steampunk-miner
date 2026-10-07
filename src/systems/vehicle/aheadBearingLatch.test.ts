import { describe, expect, it } from 'vitest'
import { aheadBearingOfDrive, latchAheadBearing, type DrillBit } from './aheadBearingLatch'
import { drillGearCellsAt } from './drillGearCells'
import { drillStampOf } from './drillStamp'
import type { DriveSigns } from './driveSigns'
import { FACING, type VehiclePose } from './vehiclePose'

// The twin bit's bearing from the reported drive, latched per cell (TD lock and Gameplay's input
// rule on #279).

/** Upright at (30.5, 286.5) m, drilling down: the cell past the bit is (30, 284). */
const DRILLING_DOWN: VehiclePose = {
  x: 30500,
  y: 286500,
  vx: 0,
  vy: 0,
  upx: 0,
  upy: 1024,
  facing: FACING.down,
}
const STRAIGHT = { tx: 30, ty: 284 }
const DOWN_RIGHT = { tx: 31, ty: 284 }
const DOWN_LEFT = { tx: 29, ty: 284 }

function bitAt(pose: VehiclePose, drive: DriveSigns): DrillBit {
  return { pose, disc: drillStampOf(pose, false), drive }
}

const pushing = (x: -1 | 0 | 1): DriveSigns => ({ x, y: -1 })
const standing = () => true
const cut = () => false

describe('ahead bearing latch', () => {
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
    const cellOn = (driveX: -1 | 0 | 1) => {
      const reach = {
        aheadCells: 1,
        sideCells: 0,
        aheadBearing: aheadBearingOfDrive(FACING.down, driveX),
      }
      const stamp = drillStampOf(DRILLING_DOWN, false)
      return drillGearCellsAt(DRILLING_DOWN, stamp, reach).ahead[0]
    }
    expect(cellOn(1)).toEqual(DOWN_RIGHT)
    expect(cellOn(-1)).toEqual(DOWN_LEFT)
    expect(cellOn(0)).toEqual(STRAIGHT)
  })

  it("latches the drive's bearing and its cell when a cell's dig starts", () => {
    expect(latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(0)), standing)).toEqual({
      bearing: 'facing',
      tile: STRAIGHT,
    })
    expect(latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(1)), standing)).toEqual({
      bearing: 'left',
      tile: DOWN_RIGHT,
    })
  })

  it("leaves the current cell's bearing unchanged when the drive flips mid-cell", () => {
    const started = latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(-1)), standing)
    expect(latchAheadBearing(started, bitAt(DRILLING_DOWN, pushing(1)), standing)).toBe(started)
    const straight = latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(0)), standing)
    expect(latchAheadBearing(straight, bitAt(DRILLING_DOWN, pushing(1)), standing)).toBe(straight)
  })

  it('follows the new drive on the next cell, once the latched one is cut', () => {
    const started = latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(-1)), standing)
    expect(latchAheadBearing(started, bitAt(DRILLING_DOWN, pushing(1)), cut)).toEqual({
      bearing: 'left',
      tile: DOWN_RIGHT,
    })
  })

  it('reads the drive again once the bit has moved off the latched cell', () => {
    const started = latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(0)), standing)
    const deeper = { ...DRILLING_DOWN, y: DRILLING_DOWN.y - 1000 }
    expect(latchAheadBearing(started, bitAt(deeper, pushing(-1)), standing)).toEqual({
      bearing: 'right',
      tile: { tx: 29, ty: 283 },
    })
  })
})
