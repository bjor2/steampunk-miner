import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../constants/physics'
import { bayOfPose, bayPoseAt, dockedPoseAt, isInPadZone } from '../vehicle/vehiclePose'
import { bayColumnsOf } from './dockBays'
import { dockSiteOf } from './dockSite'
import { planetParamsFor } from './planetParams'

const SITE = dockSiteOf(planetParamsFor(83921, 1))
const REFINERY_SITE = dockSiteOf(planetParamsFor(83921, 3))

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
    for (const bay of SITE.bays) expect(bayOfPose(SITE, bayPoseAt(SITE, bay))).toBe(bay)
    const hub = { ...dockedPoseAt(SITE), x: 0 }
    expect(isInPadZone(SITE, hub)).toBe(true)
    expect(bayOfPose(SITE, hub)).toBeNull()
  })

  it('finds no bay above the cleared air', () => {
    const high = { ...dockedPoseAt(SITE), y: (SITE.clearanceTopRow + 1) * MM_PER_METRE + 500 }
    expect(bayOfPose(SITE, high)).toBeNull()
  })

  it('has only the Sell and Upgrade bays on planets 1 and 2', () => {
    expect(SITE.bays).toEqual(['sell', 'upgrade'])
    expect(dockSiteOf(planetParamsFor(83921, 2)).bays).toEqual(['sell', 'upgrade'])
    const whereRefineryWouldBe = { ...dockedPoseAt(SITE), x: 12 * MM_PER_METRE }
    expect(bayOfPose(SITE, whereRefineryWouldBe)).toBeNull()
  })

  it('adds the Refinery bay 8 m past the Upgrade bay from planet 3, on the widened pad', () => {
    expect(REFINERY_SITE.bays).toEqual(['sell', 'upgrade', 'refinery'])
    const distance = bayPoseAt(REFINERY_SITE, 'refinery').x - bayPoseAt(REFINERY_SITE, 'upgrade').x
    expect(distance).toBe(8 * MM_PER_METRE)
    expect(bayColumnsOf(REFINERY_SITE, 'refinery').lastColumn).toBe(REFINERY_SITE.lastColumn)
    for (const bay of REFINERY_SITE.bays) {
      expect(bayOfPose(REFINERY_SITE, bayPoseAt(REFINERY_SITE, bay))).toBe(bay)
    }
  })

  it('keeps the Sell and Upgrade bays where they were when the pad widens', () => {
    for (const bay of SITE.bays) {
      expect(bayPoseAt(REFINERY_SITE, bay).x).toBe(bayPoseAt(SITE, bay).x)
    }
  })
})
