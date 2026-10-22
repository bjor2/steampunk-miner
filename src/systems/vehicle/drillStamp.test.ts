import { describe, expect, it } from 'vitest'
import { BODY_HALF_SIZE_MM, DRILL_REPORT_STAMP_LENGTH_MM } from '../../constants/balance'
import { VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { MM_PER_SAMPLE } from '../world/sampleGrid'
import { drillStampLiftMm } from './drillBore'
import { cuttingReachStampOf, drillStampOf, reportCutStampOf, stepReachStampOf } from './drillStamp'
import { FACING } from './vehiclePose'

/** R = 10^6 tiles in mm (ticket 339). */
const MILLION_TILES_MM = 1_000_000_000

describe('drill stamp', () => {
  it('levels its floor at the wheels from the exact distance to the centre at R = 10^6 tiles', () => {
    // floor(sqrt(x² + y²)) is 1 000 000 004 here; the double rounds it up to ...005.
    const pose = { x: 100_000, y: MILLION_TILES_MM, vx: 0, vy: 0, upx: 0, upy: 1024 }
    const stamp = drillStampOf({ ...pose, facing: FACING.right }, false)
    const wheelsMm = 1_000_000_004 - (VEHICLE_COLLIDER_SIZE * 1000) / 2
    // 20 mm: the floor's allowance for a body resting a hair into its floor.
    expect(stamp.floorRadiusMm).toBe(Math.floor((wheelsMm + 20) / MM_PER_SAMPLE) * MM_PER_SAMPLE)
    expect(stamp.yMm).toBe(MILLION_TILES_MM + drillStampLiftMm())
  })
})

describe('drill stamp on the 1.2 m bore (GD lock on #662)', () => {
  const SURFACE = { x: 20_500, y: 280_000, vx: 0, vy: 0, upx: 0, upy: 1024 }

  it('gives the drill disc a bore wall, so its contour lies on its circle', () => {
    expect(drillStampOf({ ...SURFACE, facing: FACING.down }, false).edge).toBe('boreWall')
  })

  it('runs a pose report’s cut on along the facing from its stamp, the stamp’s centre its tail', () => {
    const pose = { ...SURFACE, facing: FACING.down }
    const stamp = drillStampOf(pose, false)
    const cut = reportCutStampOf(pose, false)
    expect(cut.tail).toEqual({ xMm: stamp.xMm, yMm: stamp.yMm })
    expect(stamp.yMm - cut.yMm).toBe(DRILL_REPORT_STAMP_LENGTH_MM)
  })

  it('keeps a level cut’s report stamp where it is, with its floor band under the wheels', () => {
    const pose = { ...SURFACE, facing: FACING.left }
    const cut = reportCutStampOf(pose, false)
    expect(cut).toEqual(drillStampOf(pose, false))
    expect(cut.floorBand).toEqual({ upx: 0, upy: 1024, halfWidthMm: BODY_HALF_SIZE_MM })
  })

  it('gives a lifting cut no floor band: the whole disc follows the path', () => {
    expect(drillStampOf({ ...SURFACE, facing: FACING.left }, true).floorBand).toBeUndefined()
  })

  it('reads a step’s reach from the report’s stamp at the face to its front', () => {
    const pose = { ...SURFACE, facing: FACING.down }
    const face = drillStampOf(pose, false)
    const reach = stepReachStampOf(pose, false, 2_000)
    expect(reach.tail).toEqual({ xMm: face.xMm, yMm: face.yMm })
    expect(reach.yMm).toBe(SURFACE.y - 2_000)
    expect(cuttingReachStampOf(pose, false, 2_000).tail).toEqual(reach.tail)
  })
})
