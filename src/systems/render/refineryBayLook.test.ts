import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import type { RefineryBatch } from '../authority/refinery/refineryBatch'
import { dockSiteOf } from '../world/dockSite'
import { planetParamsFor } from '../world/planetParams'
import { refineryBayLookOf, refineryBayOffsetOf, refineryBayQuadsOf } from './refineryBayLook'

const batch = (readyAtTick: number): RefineryBatch => ({
  owner: 'p1',
  tier: 7,
  units: 5,
  readyAtTick,
  queuedTick: 0,
  queuedPlanet: 3,
})

describe('refinery bay look', () => {
  it('is idle with empty slots, refining while a batch runs, ready once one waits', () => {
    expect(refineryBayLookOf([null], 100)).toBe('idle')
    expect(refineryBayLookOf([batch(200)], 100)).toBe('refining')
    expect(refineryBayLookOf([batch(200), batch(50)], 100)).toBe('ready')
  })

  it('draws the frame and only the look it shows', () => {
    const ids = (look: 'idle' | 'refining' | 'ready') =>
      refineryBayQuadsOf(SHIPPED_ART, look).map((quad) => quad.partId)
    expect(ids('idle')).toEqual(['platform-bay-refinery', 'refinery-idle'])
    expect(ids('refining')).toEqual(['platform-bay-refinery', 'refinery-refining'])
    expect(ids('ready')).toEqual(['platform-bay-refinery', 'refinery-ready'])
  })

  it('stands in the yard on the dock point, over its pad zone (#170)', () => {
    expect(refineryBayOffsetOf(dockSiteOf(planetParamsFor(83921, 3)))).toBe(0)
  })
})
