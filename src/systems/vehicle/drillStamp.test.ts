import { describe, expect, it } from 'vitest'
import { DRILL_STAMP_LIFT_MM } from '../../constants/balance'
import { VEHICLE_COLLIDER_SIZE } from '../../constants/physics'
import { MM_PER_SAMPLE } from '../world/sampleGrid'
import { drillStampOf } from './drillStamp'
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
    expect(stamp.yMm).toBe(MILLION_TILES_MM + DRILL_STAMP_LIFT_MM)
  })
})
