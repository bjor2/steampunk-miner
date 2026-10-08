import { describe, expect, it } from 'vitest'
import type { DrillBit } from './aheadBearingLatch'
import { drillStampOf } from './drillStamp'
import { NO_DRIVE, type DriveSigns } from './driveSigns'
import { facedSideOf, latchFacedSide, sideOfPush, sideSeedOf, type SideLatch } from './facedSide'
import { FACING, type Facing, type VehiclePose } from './vehiclePose'

// The one meaning of "the side you're steering toward" (TD lock on #276): the crossing drive,
// latched per cell by the drill cut, seeded when the side cutters' hold starts.

/** Upright at (30.5, 286.5) m, facing `facing`: drilling down, the cell past the bit is (30, 284). */
function poseFacing(facing: Facing): VehiclePose {
  return { x: 30500, y: 286500, vx: 0, vy: 0, upx: 0, upy: 1024, facing }
}

const DRILLING_DOWN = poseFacing(FACING.down)
const NEXT_ROW_DOWN: VehiclePose = { ...DRILLING_DOWN, y: 285500 }
const FIRST_CELL = { tx: 30, ty: 284 }

function bitAt(pose: VehiclePose, drive: DriveSigns): DrillBit {
  return { pose, disc: drillStampOf(pose, false), drive }
}

const pushing = (x: -1 | 0 | 1): DriveSigns => ({ x, y: -1 })
const standing = () => true
const cut = () => false

describe('faced side', () => {
  it('reads the drive that crosses the bore: x facing down or up, y facing left or right', () => {
    expect(sideOfPush(FACING.down, { x: 1, y: -1 })).toBe('left')
    expect(sideOfPush(FACING.down, { x: -1, y: 0 })).toBe('right')
    expect(sideOfPush(FACING.up, { x: 1, y: 0 })).toBe('right')
    expect(sideOfPush(FACING.right, { x: 0, y: 1 })).toBe('left')
    expect(sideOfPush(FACING.left, { x: 0, y: 1 })).toBe('right')
    expect(sideOfPush(FACING.down, { x: 0, y: -1 })).toBeNull()
    expect(sideOfPush(FACING.right, { x: 1, y: 0 })).toBeNull()
  })

  it('names the same side as the twin bit turns toward: driving right while drilling down', () => {
    expect(sideOfPush(FACING.down, { x: 1, y: 0 })).toBe('left')
  })

  it('seeds the hold with the facing it started on when that pointed left or right', () => {
    expect(sideSeedOf(poseFacing(FACING.right))).toEqual({ x: 1, y: 0 })
    expect(sideSeedOf(poseFacing(FACING.left))).toEqual({ x: -1, y: 0 })
    expect(sideSeedOf(poseFacing(FACING.down))).toEqual(NO_DRIVE)
    // Faced right, then dug down: the right flank on screen, the facing's left.
    expect(facedSideOf({}, DRILLING_DOWN, NO_DRIVE, sideSeedOf(poseFacing(FACING.right)))).toBe(
      'left',
    )
  })

  it("names exactly one side with no drive, no latch and no left or right facing: the facing's right", () => {
    expect(facedSideOf({}, DRILLING_DOWN, NO_DRIVE, NO_DRIVE)).toBe('right')
    expect(facedSideOf({}, poseFacing(FACING.up), NO_DRIVE)).toBe('right')
  })

  it('prefers the held latch, then the drive, then the seed', () => {
    const latched = { sideLatch: { side: 'right' as const, tile: FIRST_CELL } }
    expect(facedSideOf(latched, DRILLING_DOWN, pushing(1), { x: 1, y: 0 })).toBe('right')
    expect(facedSideOf({}, DRILLING_DOWN, pushing(-1), { x: 1, y: 0 })).toBe('right')
    expect(facedSideOf({}, DRILLING_DOWN, pushing(0), { x: -1, y: 0 })).toBe('right')
    expect(facedSideOf({}, DRILLING_DOWN, pushing(0), { x: 1, y: 0 })).toBe('left')
  })

  it("latches the drive's side on the bit's first cell when its dig starts", () => {
    expect(latchFacedSide({}, bitAt(DRILLING_DOWN, pushing(1)), NO_DRIVE, standing)).toEqual({
      side: 'left',
      tile: FIRST_CELL,
    })
  })

  it('holds the latched side while its cell stands, however the stick wobbles', () => {
    const sideLatch: SideLatch = { side: 'left', tile: FIRST_CELL }
    const flipped = latchFacedSide(
      { sideLatch },
      bitAt(DRILLING_DOWN, pushing(-1)),
      NO_DRIVE,
      standing,
    )
    expect(flipped).toEqual(sideLatch)
  })

  it('follows the new drive on the next cell, once the latched one is cut', () => {
    const sideLatch: SideLatch = { side: 'left', tile: FIRST_CELL }
    const next = latchFacedSide({ sideLatch }, bitAt(DRILLING_DOWN, pushing(-1)), NO_DRIVE, cut)
    expect(next).toEqual({ side: 'right', tile: FIRST_CELL })
  })

  it('keeps the latched side on the next cell while no side is pushed', () => {
    const sideLatch: SideLatch = { side: 'left', tile: FIRST_CELL }
    const next = latchFacedSide(
      { sideLatch },
      bitAt(NEXT_ROW_DOWN, pushing(0)),
      { x: -1, y: 0 },
      standing,
    )
    expect(next).toEqual({ side: 'left', tile: { tx: 30, ty: 283 } })
  })

  it('takes the seed for the first cell when nothing is pushed and nothing is latched', () => {
    const first = latchFacedSide({}, bitAt(DRILLING_DOWN, pushing(0)), { x: -1, y: 0 }, standing)
    expect(first.side).toBe('right')
  })
})
