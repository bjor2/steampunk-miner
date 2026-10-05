import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../constants/physics'
import { bayOfPose, bayPoseAt, dockedPoseAt, isInPadZone } from '../vehicle/vehiclePose'
import { BAY_IDS, bayColumnsOf } from './dockBays'
import { dockSiteOf } from './dockSite'
import { planetParamsFor } from './planetParams'

const SITE = dockSiteOf(planetParamsFor(83921, 1))

describe('dock bays', () => {
  it('puts the Sell and Upgrade bay pads 8 m apart centre to centre', () => {
    const distance = bayPoseAt(SITE, 'upgrade').x - bayPoseAt(SITE, 'sell').x
    expect(distance).toBe(8 * MM_PER_METRE)
  })

  it('keeps both bay zones on the pad, with the hub between them', () => {
    const sell = bayColumnsOf(SITE, 'sell')
    const upgrade = bayColumnsOf(SITE, 'upgrade')
    expect(sell.firstColumn).toBeGreaterThanOrEqual(SITE.firstColumn)
    expect(upgrade.lastColumn).toBeLessThanOrEqual(SITE.lastColumn)
    expect(upgrade.firstColumn - sell.lastColumn).toBeGreaterThan(1)
  })

  it('starts the run and lands the tow in the Sell bay', () => {
    expect(bayOfPose(SITE, dockedPoseAt(SITE))).toBe('sell')
  })

  it('finds each bay at its own rest pose and none on the hub', () => {
    for (const bay of BAY_IDS) expect(bayOfPose(SITE, bayPoseAt(SITE, bay))).toBe(bay)
    const hub = { ...dockedPoseAt(SITE), x: 0 }
    expect(isInPadZone(SITE, hub)).toBe(true)
    expect(bayOfPose(SITE, hub)).toBeNull()
  })

  it('finds no bay above the cleared air', () => {
    const high = { ...dockedPoseAt(SITE), y: (SITE.clearanceTopRow + 1) * MM_PER_METRE + 500 }
    expect(bayOfPose(SITE, high)).toBeNull()
  })
})
