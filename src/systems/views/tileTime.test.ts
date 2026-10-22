import { describe, expect, it } from 'vitest'
import { engineStatsAtStep } from '../economy/vehicleStats'
import { FACING } from '../vehicle/vehiclePose'
import { tileTimeAlong } from './tileTime'

// "Time per tile here" (#7) under Bjor's ruling on #723: a sideways cut is held to the drive's
// speed, so where the drill would be faster the readout gives the drive's time and its m/s.

const DRIVE = engineStatsAtStep(2).speedMax
/** A drill that cuts the tile in 2 ticks: 30 m/s, past the 6.6 m/s drive. */
const FAST_DRILL_TICKS = 2
/** A drill that takes 30 ticks over the tile: 2 m/s, under the drive. */
const SLOW_DRILL_TICKS = 30

describe('tile time ahead under the drive cap (ticket 723)', () => {
  it("reads the drive's time and its effective m/s where a sideways cut is drive-bound", () => {
    for (const facing of [FACING.left, FACING.right]) {
      const reading = tileTimeAlong(facing, FAST_DRILL_TICKS, DRIVE)
      expect(reading).toEqual({ state: 'drive', text: '0.16 s · 6.61 m/s', ticks: 60 / DRIVE })
    }
  })

  it("reads the drill's own time sideways where the drill is the slower", () => {
    const reading = tileTimeAlong(FACING.right, SLOW_DRILL_TICKS, DRIVE)
    expect(reading).toEqual({ state: 'time', text: '0.50 s', ticks: SLOW_DRILL_TICKS })
  })

  it("reads the drill's own time down and up, however slow the drive", () => {
    for (const facing of [FACING.down, FACING.up]) {
      const reading = tileTimeAlong(facing, FAST_DRILL_TICKS, DRIVE)
      expect(reading).toEqual({ state: 'time', text: '0.04 s', ticks: FAST_DRILL_TICKS })
    }
  })
})
