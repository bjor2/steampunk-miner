import { describe, expect, it } from 'vitest'
import { FACING, type Facing, type VehiclePose } from '../../../../systems/vehicle/vehiclePose'
import {
  awayDirectionOf,
  chipOffsetOf,
  chipStackOf,
  motionOfPose,
  placeInLocalFrame,
  plaqueBandOf,
  type VehicleMotion,
} from './chipPlacement'

const DRIVE_SPEED = 4

/** Upright at the planet's top (up = +y), moving at (vx, vy) mm/s. */
function poseMoving(vx: number, vy: number, facing: Facing = FACING.down): VehiclePose {
  return { x: 0, y: 100_000, vx, vy, upx: 0, upy: 1024, facing }
}

const motion = (pose: VehiclePose): VehicleMotion => motionOfPose(pose, DRIVE_SPEED)

describe('chip placement', () => {
  it('puts chips above the vehicle while it drills down at rest', () => {
    expect(awayDirectionOf(motion(poseMoving(0, 0)))).toEqual({ along: 0, upward: 1 })
  })

  it('puts chips behind the drill while it drills sideways at drive speed', () => {
    const drivingRight = motion(poseMoving(3000, 0, FACING.right))
    expect(awayDirectionOf(drivingRight)).toEqual({ along: -1, upward: 0 })
  })

  it('puts chips below the vehicle while it lifts faster than it drives', () => {
    const away = awayDirectionOf(motion(poseMoving(0, 9000, FACING.down)))
    expect(away.upward).toBe(-1)
  })

  it('reads directions in the local frame on the side of the planet', () => {
    // At the planet's right side local up is +x; lifting there moves along +x in the world.
    const lifting: VehiclePose = {
      x: 100_000,
      y: 0,
      vx: 9000,
      vy: 0,
      upx: 1024,
      upy: 0,
      facing: FACING.down,
    }
    expect(awayDirectionOf(motion(lifting)).upward).toBe(-1)
  })

  it('moves the plaque to the bottom band only while lifting at speed', () => {
    expect(plaqueBandOf(motion(poseMoving(0, 9000)))).toBe('bottom')
    expect(plaqueBandOf(motion(poseMoving(0, -9000)))).toBe('top')
    expect(plaqueBandOf(motion(poseMoving(0, 2000)))).toBe('top')
    expect(plaqueBandOf(motionOfPose(null, DRIVE_SPEED))).toBe('top')
  })

  it('keeps every chip at least 1.5 tiles clear of the hull', () => {
    expect(chipOffsetOf({ along: 0, upward: 1 }).upward - 0.45).toBeGreaterThanOrEqual(1.5)
  })

  it('stacks later chips away from the vehicle, up above it and down below it', () => {
    expect(chipStackOf({ along: 0, upward: 1 }, 2)).toBe(-2)
    expect(chipStackOf({ along: 0, upward: -1 }, 2)).toBe(2)
  })

  it('turns a local offset into a world point with the vehicle local up', () => {
    const out = { x: 0, y: 0 }
    placeInLocalFrame({ x: 10, y: 0 }, { x: 1, y: 0 }, { along: 0, upward: 2 }, out)
    expect(out).toEqual({ x: 12, y: 0 })
    placeInLocalFrame({ x: 0, y: 10 }, { x: 0, y: 1 }, { along: 2, upward: 0 }, out)
    expect(out).toEqual({ x: 2, y: 10 })
  })
})
