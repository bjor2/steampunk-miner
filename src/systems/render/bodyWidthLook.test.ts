import { describe, expect, it } from 'vitest'
import { AIM_STEPS_PER_TURN, MM_PER_METRE, VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { BODY_ANCHOR_M } from '../../constants/scene'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { slotOfPartId } from '../art/artIds'
import { AIM, aimTurnOf, type Aim } from '../vehicle/aim'
import { nextBodyGrowth, growthStepMm, type BodyGrowth } from '../vehicle/bodyGrowth'
import {
  bodyHalfMmAt,
  bodyReachMmAlong,
  bodyReachMmAlongAt,
  bodyWidthMmAt,
} from '../vehicle/drillBore'
import {
  bodyWidthScaleOf,
  drawnBodyWidthOf,
  drawnFaceGrowthOf,
  heldMountScaleOf,
  heldMountShiftOf,
  heldMountXOf,
  hullRootWidthShareOf,
  rideGrownFace,
  type RigWidth,
} from './bodyWidthLook'
import { createDrillHeadPose } from './drillHeadPose'
import { turnedWidthShareOf } from './stagedTurn'
import { vehicleBodyQuadsOf } from './vehicleLook'

/** The TD's Marks for the CPU check (6408476161), and the VS's 1, 101 and 1e6 among them. */
const MARKS = [1, 5, 20, 101, 1_000_000]

/** The HS's data curve against the settled collider (the TD's 05:55 ruling on #666). */
const CURVE_MARKS = [0, 1, 2, 3, 10, 101, 1_000_000]

/** The ticket's tolerance, m. */
const WIDTH_TOLERANCE_M = 0.05

/** The shipped hitch's 7 cm overhang past the stern, and the turret's trunnion near the middle. */
const HITCH_X = -0.52
const TURRET_X = 0.04

/** Growth steps a settle starts short of its level: enough to cross a step's rounding. */
const SETTLE_STEPS = 10

const roomEverywhere = () => 0

/** The collider's half side once it has grown to `widthLevel`, m, as the growth motor reports it. */
function settledHalfSideAt(widthLevel: number): number {
  const ownedHalfMm = bodyHalfMmAt(widthLevel)
  const startMm = Math.max(bodyHalfMmAt(0), ownedHalfMm - SETTLE_STEPS * growthStepMm())
  let growth: BodyGrowth = { halfMm: startMm, waitedTicks: 0, climbMm: 0 }
  for (let step = 0; step < 2 * SETTLE_STEPS; step += 1)
    growth = nextBodyGrowth(growth, ownedHalfMm, roomEverywhere)
  return growth.halfMm / MM_PER_METRE
}

function rigAt(widthLevel: number): RigWidth {
  return { bodyHalfSide: settledHalfSideAt(widthLevel) }
}

function angleOfAim(aim: Aim): number {
  return (aimTurnOf(AIM.right, aim) * 2 * Math.PI) / AIM_STEPS_PER_TURN
}

/** Where a quad point at authored `quadX` lands under a held mount, as the scene nests the groups. */
function drawnHeldPointX(quadX: number, mountX: number, rig: RigWidth, turn: number): number {
  const hullShare = hullRootWidthShareOf(turn, rig)
  return hullShare * (heldMountShiftOf(mountX, rig) + heldMountScaleOf(rig) * quadX)
}

describe('drawn body width (ticket 913)', () => {
  it('draws the body as wide as its collider within 0.05 m at every tested Mark', () => {
    for (const mark of MARKS) {
      const rig = rigAt(mark)
      expect(Math.abs(drawnBodyWidthOf(rig) - 2 * rig.bodyHalfSide)).toBeLessThanOrEqual(
        WIDTH_TOLERANCE_M,
      )
    }
  })

  it('puts the drawn body edges on the collider edges at every tested Mark', () => {
    for (const mark of MARKS) {
      const rig = rigAt(mark)
      const halfDrawn = drawnBodyWidthOf(rig) / 2
      expect(Math.abs(BODY_ANCHOR_M.x + halfDrawn - rig.bodyHalfSide)).toBeLessThanOrEqual(
        WIDTH_TOLERANCE_M,
      )
      expect(Math.abs(BODY_ANCHOR_M.x - halfDrawn + rig.bodyHalfSide)).toBeLessThanOrEqual(
        WIDTH_TOLERANCE_M,
      )
    }
  })

  it('draws each rig from its own collider, two Marks in one scene', () => {
    const near = rigAt(1)
    const far = rigAt(20)
    expect(Math.abs(drawnBodyWidthOf(near) - 2 * near.bodyHalfSide)).toBeLessThanOrEqual(
      WIDTH_TOLERANCE_M,
    )
    expect(Math.abs(drawnBodyWidthOf(far) - 2 * far.bodyHalfSide)).toBeLessThanOrEqual(
      WIDTH_TOLERANCE_M,
    )
    expect(drawnBodyWidthOf(far)).toBeGreaterThan(drawnBodyWidthOf(near) + 18)
  })

  it('follows the collider while it grows, step by step', () => {
    const halfSides = [0.45, 0.467, 0.6, 0.949]
    for (const bodyHalfSide of halfSides)
      expect(drawnBodyWidthOf({ bodyHalfSide })).toBeCloseTo(2 * bodyHalfSide, 9)
  })

  it('draws the bare rig at its authored width', () => {
    const bare = rigAt(0)
    expect(bodyWidthScaleOf(bare)).toBe(1)
    expect(drawnBodyWidthOf(bare)).toBe(VEHICLE_COLLIDER_SIZE)
  })

  it('stacks on the turntable share across the width only, never replacing it', () => {
    const rig = rigAt(5)
    for (const turn of [0, Math.PI / 3, Math.PI / 2, Math.PI])
      expect(hullRootWidthShareOf(turn, rig)).toBeCloseTo(
        turnedWidthShareOf(turn) * bodyWidthScaleOf(rig),
        12,
      )
    expect(hullRootWidthShareOf(Math.PI, rig)).toBeLessThan(0)
    expect(hullRootWidthShareOf(0.4, rigAt(0))).toBe(turnedWidthShareOf(0.4))
  })
})

describe('drawn width data curve (ticket 913, the HS check)', () => {
  it('settles the collider at half the width row within 0.05 m at every tested Mark', () => {
    for (const mark of CURVE_MARKS) {
      const curveHalfSide = bodyWidthMmAt(mark) / 2 / MM_PER_METRE
      expect(Math.abs(settledHalfSideAt(mark) - curveHalfSide)).toBeLessThanOrEqual(
        WIDTH_TOLERANCE_M,
      )
    }
  })
})

describe('held mounts on the drawn body (ticket 913)', () => {
  it('stands the body anchor on the shipped chassis centre', () => {
    const chassis = vehicleBodyQuadsOf(SHIPPED_ART, 1).find(
      (quad) => slotOfPartId(quad.partId) === 'chassis',
    )
    expect(chassis?.centre[0]).toBeCloseTo(BODY_ANCHOR_M.x, 6)
    expect(chassis?.centre[1]).toBeCloseTo(BODY_ANCHOR_M.y, 6)
  })

  it('moves a mount on the body out with it in proportion', () => {
    for (const mark of MARKS) {
      const rig = rigAt(mark)
      expect(heldMountXOf(TURRET_X, rig)).toBeCloseTo(TURRET_X * bodyWidthScaleOf(rig), 6)
    }
  })

  it('keeps a mount past the stern its overhang from the scaled edge at every Mark', () => {
    for (const mark of MARKS) {
      const rig = rigAt(mark)
      const overhang = -rig.bodyHalfSide - heldMountXOf(HITCH_X, rig)
      expect(overhang).toBeCloseTo(-VEHICLE_COLLIDER_SIZE / 2 - HITCH_X, 6)
    }
  })

  it('keeps a held part its authored size while its mount rides the edge', () => {
    const rig = rigAt(20)
    const turn = Math.PI / 4
    const share = turnedWidthShareOf(turn)
    const mountLanding = drawnHeldPointX(HITCH_X, HITCH_X, rig, turn)
    const partEnd = drawnHeldPointX(HITCH_X - 0.3, HITCH_X, rig, turn)
    expect(mountLanding).toBeCloseTo(share * heldMountXOf(HITCH_X, rig), 9)
    expect(mountLanding - partEnd).toBeCloseTo(share * 0.3, 9)
  })

  it('leaves every mount where it was on a bare rig', () => {
    const bare = rigAt(0)
    for (const mountX of [HITCH_X, TURRET_X, 0.65]) {
      expect(heldMountXOf(mountX, bare)).toBeCloseTo(mountX, 12)
      expect(heldMountShiftOf(mountX, bare)).toBeCloseTo(0, 12)
    }
  })
})

describe('drawn drill head on a wide rig (ticket 913)', () => {
  it('rides the grown face along every aim, as the body reach the cut reads', () => {
    for (const mark of [1, 5, 20]) {
      const rig = rigAt(mark)
      for (let aim = 0; aim < AIM_STEPS_PER_TURN; aim += 1) {
        const cutGrowthM = (bodyReachMmAlongAt(aim, mark) - bodyReachMmAlong(aim)) / MM_PER_METRE
        expect(Math.abs(drawnFaceGrowthOf(angleOfAim(aim), rig) - cutGrowthM)).toBeLessThan(0.01)
      }
    }
  })

  it('moves the head out along its own angle by the face growth', () => {
    const rig = rigAt(1)
    const pose = createDrillHeadPose()
    pose.angle = -Math.PI / 2
    pose.y = -0.6
    rideGrownFace(pose, rig)
    expect(pose.x).toBeCloseTo(0, 9)
    expect(pose.y).toBeCloseTo(-0.6 - (rig.bodyHalfSide - VEHICLE_COLLIDER_SIZE / 2), 9)
  })

  it('leaves the bare rig head where ticket 789 put it', () => {
    const pose = createDrillHeadPose()
    pose.x = 0.6
    rideGrownFace(pose, rigAt(0))
    expect(pose).toEqual({ x: 0.6, y: 0, angle: 0 })
  })
})
