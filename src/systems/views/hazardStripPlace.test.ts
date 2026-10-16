import { describe, expect, it } from 'vitest'
import { BODY_HALF_SIZE_MM } from '../../constants/balance'
import {
  VIEW_SHORT_AXIS_DEFAULT_M,
  VIEW_SHORT_AXIS_MAX_M,
  VIEW_SHORT_AXIS_MIN_M,
} from '../../constants/scene'
import { hazardStripReachOf, hazardStripStyleOf } from './hazardStripPlace'

// VS on #500: the hazard strip is its own box, out of the vehicle's way at every zoom, and its
// size depends on the screen alone.

const CELLS = [
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 844, height: 390 },
  { width: 915, height: 412 },
  { width: 320, height: 568 },
  { width: 1920, height: 1080 },
]
const ZOOMS = [VIEW_SHORT_AXIS_MIN_M, VIEW_SHORT_AXIS_DEFAULT_M, VIEW_SHORT_AXIS_MAX_M]

describe('hazard strip place (#500, VS)', () => {
  it('keeps the hazard strip a separate box that the vehicle keep-clear rect never intersects at any zoom from 8 to 20 m and at the 12 m default', () => {
    for (const screen of CELLS) {
      for (const zoom of ZOOMS) {
        // The zoom spans the height in either orientation (ticket 484).
        const bodyHalf = (BODY_HALF_SIZE_MM / 1000) * (screen.height / zoom)
        expect(hazardStripReachOf(screen).inner).toBeGreaterThan(bodyHalf)
      }
    }
  })

  it('keeps the hazard strip the same size per orientation at any drill level, speed and depth', () => {
    expect(hazardStripReachOf({ width: 390, height: 844 })).toEqual(
      hazardStripReachOf({ width: 844, height: 390 }),
    )
    expect(hazardStripStyleOf()).toEqual({ '--strip-inner': '14vmin', '--strip-length': '30vmin' })
  })
})
