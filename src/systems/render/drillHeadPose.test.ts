import { describe, expect, it } from 'vitest'
import { SWIVEL_TICKS } from '../../constants/balance'
import { newDrillHead, stepDrillHead, type DrillHead } from '../vehicle/drillHead'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import { createDrillHeadPose, writeDrillHeadPose } from './drillHeadPose'

const REACH = 0.6

function poseOf(head: DrillHead) {
  const pose = createDrillHeadPose()
  writeDrillHeadPose(head, REACH, pose)
  return pose
}

function stepped(head: DrillHead, steps: number): DrillHead {
  let turned = head
  for (let step = 0; step < steps; step++) turned = stepDrillHead(turned, null)
  return turned
}

const settledAt = (facing: Facing) => poseOf(newDrillHead(facing))

describe('drill head pose', () => {
  it.each([
    [FACING.right, REACH, 0],
    [FACING.left, -REACH, 0],
    [FACING.up, 0, REACH],
    [FACING.down, 0, -REACH],
  ])('draws facing %i on that side of the body', (facing, x, y) => {
    const pose = settledAt(facing as Facing)
    expect(pose.x).toBeCloseTo(x, 6)
    expect(pose.y).toBeCloseTo(y, 6)
  })

  it('sweeps from the old facing to the new one over the same SWIVEL_TICKS as the logic', () => {
    const turning = stepDrillHead(newDrillHead(FACING.right), FACING.down)
    expect(poseOf(turning)).toEqual(settledAt(FACING.right))
    const done = stepped(turning, SWIVEL_TICKS)
    expect(poseOf(done).x).toBeCloseTo(settledAt(FACING.down).x, 6)
    expect(poseOf(done).y).toBeCloseTo(settledAt(FACING.down).y, 6)
    expect(poseOf(stepped(turning, SWIVEL_TICKS - 1)).y).toBeGreaterThan(-REACH)
  })

  it('keeps the head at the same reach from the body all through a turn', () => {
    const turning = stepDrillHead(newDrillHead(FACING.left), FACING.up)
    for (let step = 0; step <= SWIVEL_TICKS; step++) {
      const { x, y } = poseOf(stepped(turning, step))
      expect(Math.hypot(x, y)).toBeCloseTo(REACH, 6)
    }
  })

  it('turns the short way: a quarter turn never swings through the far side', () => {
    const turning = stepped(stepDrillHead(newDrillHead(FACING.right), FACING.up), SWIVEL_TICKS / 2)
    const pose = poseOf(turning)
    expect(pose.x).toBeGreaterThan(0)
    expect(pose.y).toBeGreaterThan(0)
  })
})
