import { describe, expect, it } from 'vitest'
import { DRILL_BORE_ROWS, STANDARD_CASING_KIND } from '../../constants/balance'
import { AIM, aimFieldsOf, type Aim } from '../vehicle/aim'
import { stampAtWidthLevel } from '../vehicle/boreWidthStamp'
import {
  boreRadiusMmAlongAt,
  cutRadiusMmAlong,
  drillStampRadiusMmAlong,
} from '../vehicle/drillBore'
import { drillStampOf } from '../vehicle/drillStamp'
import type { VehiclePose } from '../vehicle/vehiclePose'
import { casingRingAlong, casingRingAround, NO_RING_SWEEP } from './casingLining'
import { isInRingBand } from './casingRingBand'

// Ticket 833 (the TD's shape and the HS's conditions on #833): a drill trail's ring is laid round
// r(aim), the cut's radius along the aim its point was cut at, read from the one function the
// stamp reads, so a diagonal shaft's wall (0.787 m at 45 degrees) is lined as a straight one's is.

/** The body's side at a width level as the GD locked it on #662 Part B: 0.9 m and 1 m a level. */
const bodyHalfMmAt = (widthLevel: number) => (900 + widthLevel * 1000) / 2

/** The radius the placement rule lays a trail ring round: the rig's bore along the point's aim. */
const ringRadiusAt = (aim: Aim, widthLevel: number) => boreRadiusMmAlongAt(aim, widthLevel)

const UP_RIGHT: Aim = 8
const DOWN_RIGHT: Aim = 56

/** A pose upright at the origin, aimed at `aim`. */
function poseAimedAt(aim: Aim): VehiclePose {
  return { x: 0, y: 0, vx: 0, vy: 0, upx: 0, upy: 1024, ...aimFieldsOf(aim) }
}

/** The ring a trail point at the origin lays, its stretch running half a metre up-left of it. */
function diagonalRing(aim: Aim) {
  return casingRingAlong(0, 0, { xMm: -354, yMm: 354 }, NO_RING_SWEEP, drillStampRadiusMmAlong(aim))
}

/** The point `distanceMm` across the 45 degree stretch from its middle, on its up-right side. */
function acrossDiagonalStretch(distanceMm: number) {
  const offset = Math.round(distanceMm / Math.SQRT2)
  return { xMm: -177 + offset, yMm: 177 + offset }
}

describe('casing ring along the cut’s aim (ticket 833)', () => {
  it.each([0, 10, 1e6])(
    'puts the ring’s band round the stamp’s own radius at width level %s, at 0 and 45 degrees',
    (widthLevel) => {
      const bodyHalfMm = bodyHalfMmAt(widthLevel)
      const atFacing = cutRadiusMmAlong(AIM.right, bodyHalfMm)
      const atDiagonal = cutRadiusMmAlong(UP_RIGHT, bodyHalfMm)
      expect(atFacing).toBe(bodyHalfMm + DRILL_BORE_ROWS.sideClearanceMm)
      // Within the integer cosine table's rounding, half a step in 1024 on each of the two parts.
      const diagonalReachMm = bodyHalfMm * Math.SQRT2 + DRILL_BORE_ROWS.sideClearanceMm
      const tableRoundingMm = bodyHalfMm / 1024 + 1
      expect(Math.abs(atDiagonal - diagonalReachMm)).toBeLessThanOrEqual(tableRoundingMm)
      for (const aim of [AIM.right, UP_RIGHT]) {
        const stamp = stampAtWidthLevel(drillStampOf(poseAimedAt(aim), false), aim, widthLevel)
        const ring = casingRingAlong(
          0,
          0,
          { xMm: 0, yMm: 500 },
          NO_RING_SWEEP,
          ringRadiusAt(aim, widthLevel),
        )
        expect(stamp.radiusMm).toBe(cutRadiusMmAlong(aim, bodyHalfMm))
        expect(ring.clearMm).toBe(stamp.radiusMm - STANDARD_CASING_KIND.ringInsideMm)
        expect(ring.clearMm + ring.widthMm).toBe(
          stamp.radiusMm + STANDARD_CASING_KIND.ringOutsideMm,
        )
      }
    },
  )

  it.each([AIM.right, UP_RIGHT, 5, AIM.down, DOWN_RIGHT])(
    'lays the ring round the radius the live stamp cuts at aim %s',
    (aim) => {
      const stamp = drillStampOf(poseAimedAt(aim), false)
      const ring = casingRingAlong(
        0,
        0,
        { xMm: 0, yMm: 500 },
        NO_RING_SWEEP,
        drillStampRadiusMmAlong(aim),
      )
      expect(ring.clearMm + STANDARD_CASING_KIND.ringInsideMm).toBe(stamp.radiusMm)
    },
  )

  it('lines a 45 degree shaft’s wall rock out past 0.787 m, where a facing’s ring stopped at 0.85 m', () => {
    const diagonal = diagonalRing(DOWN_RIGHT)
    const facing = diagonalRing(AIM.down)
    const wallRock = acrossDiagonalStretch(1000)
    expect(isInRingBand(diagonal, wallRock.xMm, wallRock.yMm)).toBe(true)
    expect(isInRingBand(facing, wallRock.xMm, wallRock.yMm)).toBe(false)
    const insideTheCut = acrossDiagonalStretch(500)
    expect(isInRingBand(diagonal, insideTheCut.xMm, insideTheCut.yMm)).toBe(false)
  })

  it.each([AIM.right, AIM.up, AIM.left, AIM.down])(
    'lays a facing’s ring exactly as before, round the stamp’s radius along a facing (aim %s)',
    (aim) => {
      const stretchFromMm = { xMm: 0, yMm: 500 }
      const sweepMm = { xMm: 30, yMm: 0 }
      const radiusMm = drillStampRadiusMmAlong(aim)
      expect(casingRingAlong(0, 0, stretchFromMm, sweepMm, radiusMm)).toEqual({
        ...casingRingAround(0, 0),
        stretchFromMm,
        sweepMm,
      })
    },
  )
})
