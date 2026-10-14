import { describe, expect, it } from 'vitest'
import type { ExtraBearing } from '../economy/drillGearCaps'
import {
  aheadBearingOfDrive,
  latchAheadBearing,
  type AheadLatchRules,
  type DrillBit,
} from './aheadBearingLatch'
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
const noExtra = () => false
const allowsUp = (bearing: ExtraBearing) => bearing === 'up'
/** Every latched cell still standing, no extra bearing allowed. */
const STANDING: AheadLatchRules = { isUncut: () => true, allows: noExtra }
const CUT: AheadLatchRules = { isUncut: () => false, allows: noExtra }
const STANDING_UP: AheadLatchRules = { ...STANDING, allows: allowsUp }

/** Upright at (30.5, 284.5) m, drilling up: the ceiling cell past the bit is (30, 286). */
const DRILLING_UP: VehiclePose = { ...DRILLING_DOWN, y: 284500, facing: FACING.up }
const lifting = (x: -1 | 0 | 1): DriveSigns => ({ x, y: 1 })

describe('ahead bearing latch', () => {
  it('turns the ahead cell toward the side driven while drilling down, and only then', () => {
    expect(aheadBearingOfDrive(FACING.down, pushing(1), noExtra)).toBe('left')
    expect(aheadBearingOfDrive(FACING.down, pushing(-1), noExtra)).toBe('right')
    expect(aheadBearingOfDrive(FACING.down, pushing(0), noExtra)).toBe('facing')
    for (const facing of [FACING.left, FACING.right, FACING.up]) {
      expect(aheadBearingOfDrive(facing, pushing(1), noExtra)).toBe('facing')
      expect(aheadBearingOfDrive(facing, pushing(-1), noExtra)).toBe('facing')
    }
  })

  it('cuts the diagonal on the screen side the vehicle drives toward', () => {
    const cellOn = (driveX: -1 | 0 | 1) => {
      const reach = {
        aheadCells: 1,
        sideCells: 0,
        aheadBearing: aheadBearingOfDrive(FACING.down, pushing(driveX), noExtra),
      }
      const stamp = drillStampOf(DRILLING_DOWN, false)
      return drillGearCellsAt(DRILLING_DOWN, stamp, reach).ahead[0]
    }
    expect(cellOn(1)).toEqual(DOWN_RIGHT)
    expect(cellOn(-1)).toEqual(DOWN_LEFT)
    expect(cellOn(0)).toEqual(STRAIGHT)
  })

  it("latches the drive's bearing and its cell when a cell's dig starts", () => {
    expect(latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(0)), STANDING)).toEqual({
      bearing: 'facing',
      tile: STRAIGHT,
    })
    expect(latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(1)), STANDING)).toEqual({
      bearing: 'left',
      tile: DOWN_RIGHT,
    })
  })

  it("leaves the current cell's bearing unchanged when the drive flips mid-cell", () => {
    const started = latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(-1)), STANDING)
    expect(latchAheadBearing(started, bitAt(DRILLING_DOWN, pushing(1)), STANDING)).toBe(started)
    const straight = latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(0)), STANDING)
    expect(latchAheadBearing(straight, bitAt(DRILLING_DOWN, pushing(1)), STANDING)).toBe(straight)
  })

  it('follows the new drive on the next cell, once the latched one is cut', () => {
    const started = latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(-1)), STANDING)
    expect(latchAheadBearing(started, bitAt(DRILLING_DOWN, pushing(1)), CUT)).toEqual({
      bearing: 'left',
      tile: DOWN_RIGHT,
    })
  })

  it('reads the drive again once the bit has moved off the latched cell', () => {
    const started = latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(0)), STANDING)
    const deeper = { ...DRILLING_DOWN, y: DRILLING_DOWN.y - 1000 }
    expect(latchAheadBearing(started, bitAt(deeper, pushing(-1)), STANDING)).toEqual({
      bearing: 'right',
      tile: { tx: 29, ty: 283 },
    })
  })

  it('turns the ahead cell up toward the pushed side while lifting, only with up allowed', () => {
    expect(aheadBearingOfDrive(FACING.up, lifting(1), allowsUp)).toBe('right')
    expect(aheadBearingOfDrive(FACING.up, lifting(-1), allowsUp)).toBe('left')
    expect(aheadBearingOfDrive(FACING.up, lifting(1), noExtra)).toBe('facing')
    expect(aheadBearingOfDrive(FACING.up, lifting(0), allowsUp)).toBe('facing')
    expect(aheadBearingOfDrive(FACING.up, { x: 1, y: 0 }, allowsUp)).toBe('facing')
  })

  it('leaves drilling down and sideways as they were with up allowed', () => {
    for (const x of [-1, 0, 1] as const) {
      expect(aheadBearingOfDrive(FACING.down, pushing(x), allowsUp)).toBe(
        aheadBearingOfDrive(FACING.down, pushing(x), noExtra),
      )
      expect(aheadBearingOfDrive(FACING.left, lifting(x), allowsUp)).toBe('facing')
      expect(aheadBearingOfDrive(FACING.right, lifting(x), allowsUp)).toBe('facing')
    }
  })

  it('cuts the up-left or up-right cell above the bit on the side pushed', () => {
    expect(latchAheadBearing(null, bitAt(DRILLING_UP, lifting(1)), STANDING_UP)).toEqual({
      bearing: 'right',
      tile: { tx: 31, ty: 286 },
    })
    expect(latchAheadBearing(null, bitAt(DRILLING_UP, lifting(-1)), STANDING_UP)).toEqual({
      bearing: 'left',
      tile: { tx: 29, ty: 286 },
    })
  })

  it('drops an up latch on the tick up is no longer allowed, and reads the facing next', () => {
    const started = latchAheadBearing(null, bitAt(DRILLING_UP, lifting(1)), STANDING_UP)
    expect(latchAheadBearing(started, bitAt(DRILLING_UP, lifting(1)), STANDING_UP)).toBe(started)
    expect(latchAheadBearing(started, bitAt(DRILLING_UP, lifting(1)), STANDING)).toEqual({
      bearing: 'facing',
      tile: { tx: 30, ty: 286 },
    })
  })

  it('keeps a drilling-down diagonal latched whatever the extra bearings', () => {
    const started = latchAheadBearing(null, bitAt(DRILLING_DOWN, pushing(1)), STANDING_UP)
    expect(latchAheadBearing(started, bitAt(DRILLING_DOWN, pushing(1)), STANDING)).toBe(started)
  })
})
