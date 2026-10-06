import { describe, expect, it } from 'vitest'
import { MM_PER_METRE } from '../../constants/physics'
import { bayOfPose, bayPoseAt, dockedPoseAt, isInPadZone } from '../vehicle/vehiclePose'
import { bayColumnsOf } from './dockBays'
import { dockSiteOf } from './dockSite'
import { planetParamsFor } from './planetParams'

const SITE = dockSiteOf(planetParamsFor(83921, 1))
const REFINERY_SITE = dockSiteOf(planetParamsFor(83921, 3))

describe('dock bays', () => {
  it('lays the Sell zone under the Exchange, the Upgrade zone on the Works and the Refinery in the yard', () => {
    expect(bayColumnsOf(REFINERY_SITE, 'sell')).toEqual({ firstColumn: -7, lastColumn: -4 })
    expect(bayColumnsOf(REFINERY_SITE, 'upgrade')).toEqual({ firstColumn: 5, lastColumn: 8 })
    expect(bayColumnsOf(REFINERY_SITE, 'refinery')).toEqual({ firstColumn: -2, lastColumn: 1 })
  })

  it('rests a docked vehicle at -5 m, +7 m and 0 m from the dock point', () => {
    expect(bayPoseAt(REFINERY_SITE, 'sell').x).toBe(-5 * MM_PER_METRE)
    expect(bayPoseAt(REFINERY_SITE, 'upgrade').x).toBe(7 * MM_PER_METRE)
    expect(bayPoseAt(REFINERY_SITE, 'refinery').x).toBe(0)
  })

  it('keeps both bay zones on the pad, with the yard between them', () => {
    const sell = bayColumnsOf(SITE, 'sell')
    const upgrade = bayColumnsOf(SITE, 'upgrade')
    expect(sell.firstColumn).toBeGreaterThanOrEqual(SITE.firstColumn)
    expect(upgrade.lastColumn).toBeLessThanOrEqual(SITE.lastColumn)
    expect(upgrade.firstColumn - sell.lastColumn).toBeGreaterThan(1)
  })

  it('starts the run and lands the tow in the Sell bay', () => {
    expect(bayOfPose(SITE, dockedPoseAt(SITE))).toBe('sell')
    expect(bayOfPose(REFINERY_SITE, dockedPoseAt(REFINERY_SITE))).toBe('sell')
  })

  it('finds each bay at its own rest pose and none in the yard before the Refinery', () => {
    for (const bay of SITE.bays) expect(bayOfPose(SITE, bayPoseAt(SITE, bay))).toBe(bay)
    const yard = { ...dockedPoseAt(SITE), x: 0 }
    expect(isInPadZone(SITE, yard)).toBe(true)
    expect(bayOfPose(SITE, yard)).toBeNull()
  })

  it('finds no bay above the cleared air', () => {
    const high = { ...dockedPoseAt(SITE), y: (SITE.clearanceTopRow + 1) * MM_PER_METRE + 500 }
    expect(bayOfPose(SITE, high)).toBeNull()
  })

  it('has only the Sell and Upgrade bays on planets 1 and 2', () => {
    expect(SITE.bays).toEqual(['sell', 'upgrade'])
    expect(dockSiteOf(planetParamsFor(83921, 2)).bays).toEqual(['sell', 'upgrade'])
  })

  it('docks the yard at the Refinery from its unlock planet', () => {
    expect(REFINERY_SITE.bays).toEqual(['sell', 'upgrade', 'refinery'])
    const yard = { ...dockedPoseAt(REFINERY_SITE), x: 0 }
    expect(bayOfPose(REFINERY_SITE, yard)).toBe('refinery')
    for (const bay of REFINERY_SITE.bays) {
      expect(bayOfPose(REFINERY_SITE, bayPoseAt(REFINERY_SITE, bay))).toBe(bay)
    }
  })

  it('keeps the Sell and Upgrade bays where they were when the Refinery joins', () => {
    for (const bay of SITE.bays) {
      expect(bayPoseAt(REFINERY_SITE, bay).x).toBe(bayPoseAt(SITE, bay).x)
    }
  })
})
