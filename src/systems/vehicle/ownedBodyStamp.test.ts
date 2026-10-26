import { describe, expect, it } from 'vitest'
import { DRILL_STAMP_OFFSET_MM } from '../../constants/balance'
import { MM_PER_SAMPLE, SOLID_DENSITY } from '../world/sampleGrid'
import { centreDistanceFloorMmOf } from '../world/exactSquares'
import { casingRingAround, ringSamplesOf } from '../world/casingLining'
import { AIM } from './aim'
import { bodyGrowthMmAt, bodyHalfMmAt, boreRadiusMmAt } from './drillBore'
import { drillContactOf, type DrillableGround } from './drillContact'
import {
  cuttingDrillStampOf,
  drillStampOf,
  faceGrowthMmAlong,
  reportCutStampOf,
  sweptStampAheadMmOf,
} from './drillStamp'
import { solidToeAheadOf } from './drillToe'
import { leadingSlabOf } from './leadingSlab'
import { FACING } from './vehiclePose'

// The drill placed round the body a width level owns (ticket 750, GD lock on #662 Part B): the
// pose is that body's centre, so its face lies its growth further ahead and its wheels as much
// further below, and every stamp, floor and contact moves with them. The bare level is untouched.

const SURFACE = { x: 20_500, y: 280_000, vx: 0, vy: 0, upx: 0, upy: 1024 }
const LEVEL_CUT = { ...SURFACE, facing: FACING.right }
const DOWN_CUT = { ...SURFACE, facing: FACING.down }

function wheelFloorOf(halfMm: number, jitterMm: number): number {
  const wheels = centreDistanceFloorMmOf(SURFACE.x, SURFACE.y) - halfMm
  return Math.floor((wheels + jitterMm) / MM_PER_SAMPLE) * MM_PER_SAMPLE
}

/** Solid ground in the samples `isSolid` picks, open everywhere else. */
function groundOf(isSolid: (xMm: number, yMm: number) => boolean): DrillableGround {
  return {
    densityAt: (sx, sy) => (isSolid(sx * MM_PER_SAMPLE, sy * MM_PER_SAMPLE) ? SOLID_DENSITY : 0),
    materialAt: () => 1,
  }
}

describe('owned body stamp', () => {
  it('levels a wide rig’s floor at its own wheels, half its side under the pose', () => {
    expect(drillStampOf(LEVEL_CUT, false, 1).floorRadiusMm).toBe(wheelFloorOf(bodyHalfMmAt(1), 20))
    expect(cuttingDrillStampOf(LEVEL_CUT, false, 1_000, 2).floorRadiusMm).toBe(
      wheelFloorOf(bodyHalfMmAt(2), 35),
    )
  })

  it('spans a wide rig’s floor band across its own wheels', () => {
    expect(drillStampOf(LEVEL_CUT, false, 1).floorBand?.halfWidthMm).toBe(bodyHalfMmAt(1))
  })

  it('sets a wide rig’s stamp its growth further ahead of the pose', () => {
    const bare = drillStampOf(DOWN_CUT, false)
    const wide = drillStampOf(DOWN_CUT, false, 1)
    expect(bare.yMm - wide.yMm).toBe(bodyGrowthMmAt(1))
    expect(SURFACE.y - wide.yMm).toBe(DRILL_STAMP_OFFSET_MM + bodyGrowthMmAt(1))
    expect(reportCutStampOf(DOWN_CUT, false, 1).tail).toEqual({ xMm: wide.xMm, yMm: wide.yMm })
  })

  it('places a swept front as far past a wide rig’s face as past the bare one’s', () => {
    for (const aim of [AIM.right, AIM.down, AIM.down + 8]) {
      const grownMm = sweptStampAheadMmOf(300, aim, 2) - sweptStampAheadMmOf(300, aim)
      expect(grownMm).toBe(faceGrowthMmAlong(aim, 2))
    }
    expect(faceGrowthMmAlong(AIM.right, 2)).toBe(bodyGrowthMmAt(2))
  })

  it('leaves the bare body’s stamps as they were', () => {
    expect(drillStampOf(LEVEL_CUT, false, 0)).toEqual(drillStampOf(LEVEL_CUT, false))
    expect(faceGrowthMmAlong(AIM.down, 0)).toBe(0)
  })
})

describe('owned body contact', () => {
  // Rock from 1.0 m past the pose to the right: inside a level-1 rig's face (0.95 m), past a
  // bare rig's reach plus its in-the-way window (0.45 + 0.25 m).
  const rockAhead = groundOf((xMm) => xMm >= SURFACE.x + 1_000)

  it('finds ground in a wide rig’s way at its own face', () => {
    const aim = { centreMm: LEVEL_CUT, facing: { x: 1024, y: 0 } }
    const stamp = drillStampOf(LEVEL_CUT, false, 1)
    expect(drillContactOf(rockAhead, { ...aim, stamp, widthLevel: 1 })).toBe('inTheWay')
    expect(drillContactOf(rockAhead, { ...aim, stamp: drillStampOf(LEVEL_CUT, false) })).not.toBe(
      'inTheWay',
    )
  })

  it('reads a wide rig’s leading slab past its own face', () => {
    const stamp = drillStampOf(LEVEL_CUT, false, 1)
    const aim = { centreMm: LEVEL_CUT, facing: { x: 1024, y: 0 }, stamp, widthLevel: 1 }
    const insideFace = groundOf((xMm) => xMm < SURFACE.x + bodyHalfMmAt(1))
    expect(leadingSlabOf(insideFace, aim).uncutBp).toBe(0)
    expect(leadingSlabOf(rockAhead, aim).uncutBp).toBeGreaterThan(0)
  })

  it('finds a toe at a wide rig’s lower front', () => {
    const toe = {
      densityAt: (sx: number, sy: number) => {
        const xMm = sx * MM_PER_SAMPLE
        const aboveWheelsMm = sy * MM_PER_SAMPLE - (SURFACE.y - bodyHalfMmAt(1))
        const isToe = xMm >= SURFACE.x + 1_000 && aboveWheelsMm > 0 && aboveWheelsMm <= 500
        return isToe || aboveWheelsMm <= 0 ? SOLID_DENSITY : 0
      },
    }
    expect(solidToeAheadOf(toe, LEVEL_CUT, 250, 1)).toBe(true)
  })
})

describe('owned body casing floor', () => {
  it('lines a wide ring’s floor box under its own wheels and across them', () => {
    const level = 2
    const ring = casingRingAround(SURFACE.x, SURFACE.y, boreRadiusMmAt(level))
    const keys = new Set(ringSamplesOf(ring).map(({ sx, sy }) => `${sx},${sy}`))
    // A sample row 0.3 m under the level-2 body's wheels (1.45 m under the pose), and one 0.2 m
    // inside its side: the bare floor box reached 0.45 m across and 1.2 m down.
    const rowMm = SURFACE.y - bodyHalfMmAt(level) - 300
    const keyAt = (acrossMm: number) =>
      `${(SURFACE.x + acrossMm) / MM_PER_SAMPLE},${rowMm / MM_PER_SAMPLE}`
    expect(keys.has(keyAt(0))).toBe(true)
    expect(keys.has(keyAt(bodyHalfMmAt(level) - 200))).toBe(true)
  })
})
