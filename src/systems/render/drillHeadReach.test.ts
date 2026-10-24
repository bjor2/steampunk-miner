import { describe, expect, it } from 'vitest'
import { BODY_HALF_SIZE_MM, CUT_FACE_MARGIN_MM } from '../../constants/balance'
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../constants/physics'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { NO_SWAPS } from '../art/placeholderLook'
import { onCurveSteps, startLevels, visualTier } from '../economy/vehicleStats'
import { newDrillHead } from '../vehicle/drillHead'
import { withDrillSideClearance } from '../vehicle/drillBoreFixtures'
import { ridingCutFrontAheadMmOf, sweptDrillStampOf } from '../vehicle/drillStamp'
import { FACING, facingVectorOf, type Facing, type VehiclePose } from '../vehicle/vehiclePose'
import { MM_PER_SAMPLE } from '../world/sampleGrid'
import { drillHeadReachOf, drillTipAheadOf } from './drillHeadReach'
import { createDrillHeadPose, writeDrillHeadPose } from './drillHeadPose'

const FACINGS: readonly Facing[] = [FACING.left, FACING.right, FACING.down, FACING.up]

/** A fresh run, the end of planet 1 on the curve, and far past the last tier (P200). */
const LEVELS = [startLevels(), onCurveSteps(1), onCurveSteps(200)]

/** The Workshop's drill_tip milestone swaps the tier-3 bit onto a tier-1 head. */
const SWAPS: readonly (readonly string[])[] = [NO_SWAPS, ['t3-drill-bit']]

function uprightPoseFacing(facing: Facing): VehiclePose {
  return { x: 0, y: 0, vx: 0, vy: 0, upx: 0, upy: UP_VECTOR_SCALE, facing }
}

/** How far along its facing the cut's front plane lies ahead of the body's centre, mm. */
function cutFrontAheadMm(facing: Facing): number {
  const pose = uprightPoseFacing(facing)
  const stamp = sweptDrillStampOf(pose, false, ridingCutFrontAheadMmOf())
  return alongFacingMm(facing, stamp.xMm, stamp.yMm)
}

/** How far along its facing the drawn tip lies ahead of the body's centre, mm. */
function drawnTipAheadMm(facing: Facing, tier: number, swaps: readonly string[]): number {
  const head = createDrillHeadPose()
  writeDrillHeadPose(newDrillHead(facing), drillHeadReachOf(SHIPPED_ART, tier, swaps), head)
  const tip = drillTipAheadOf(SHIPPED_ART, tier, swaps)
  const x = head.x + Math.cos(head.angle) * tip
  const y = head.y + Math.sin(head.angle) * tip
  return alongFacingMm(facing, x * MM_PER_METRE, y * MM_PER_METRE)
}

function alongFacingMm(facing: Facing, xMm: number, yMm: number): number {
  const ahead = facingVectorOf(0, UP_VECTOR_SCALE, facing)
  return (xMm * ahead.x + yMm * ahead.y) / UP_VECTOR_SCALE
}

describe('drill head reach', () => {
  it('draws the tip on the cut’s front at every tier, upgrade level, swap and facing', () => {
    for (const levels of LEVELS) {
      for (const swaps of SWAPS) {
        for (const facing of FACINGS) {
          const tier = visualTier(levels)
          expect(drawnTipAheadMm(facing, tier, swaps)).toBeCloseTo(cutFrontAheadMm(facing), 3)
        }
      }
    }
  })

  it('reaches every visual tier on the way, so each tier’s head is checked', () => {
    expect(LEVELS.map(visualTier)).toEqual([1, 2, 3])
  })

  it('keeps the tip on the front whatever the bore’s width', () => {
    for (const clearanceMm of [150, 500, 1000]) {
      withDrillSideClearance(clearanceMm, () => {
        for (const facing of FACINGS) {
          expect(drawnTipAheadMm(facing, 3, NO_SWAPS)).toBeCloseTo(cutFrontAheadMm(facing), 3)
        }
      })
    }
  })

  it('draws the tip no more than the cut’s margin and half a sample past the body’s face', () => {
    for (const tier of [1, 2, 3]) {
      const pastFaceMm = drawnTipAheadMm(FACING.right, tier, NO_SWAPS) - BODY_HALF_SIZE_MM
      expect(pastFaceMm).toBeGreaterThan(0)
      expect(pastFaceMm).toBeLessThanOrEqual(CUT_FACE_MARGIN_MM + MM_PER_SAMPLE / 2 + 1e-6)
    }
  })
})
