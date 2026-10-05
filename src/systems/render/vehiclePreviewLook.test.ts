import { describe, expect, it } from 'vitest'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { vehicleBodyQuadsOf, drillHeadQuadsOf } from './vehicleLook'
import {
  isPartOfTrack,
  previewBoundsOf,
  previewVehicleShareOf,
  previewZoomOf,
} from './vehiclePreviewLook'

const PANELS = [
  { widthPixels: 920, heightPixels: 560 },
  { widthPixels: 1840, heightPixels: 1120 },
]

const partsAt = (tier: number) => [...vehicleBodyQuadsOf(tier), ...drillHeadQuadsOf(tier)]

describe('upgrade bay preview look', () => {
  it('frames the visual vehicle at 60% of the panel height at every tier, at 1080p and 4K panel sizes', () => {
    for (const tier of [1, 2, 3]) {
      const bounds = previewBoundsOf(tier)
      for (const panel of PANELS) {
        const share = previewVehicleShareOf(
          bounds,
          previewZoomOf(bounds, panel),
          panel.heightPixels,
        )
        expect(share).toBeGreaterThanOrEqual(0.55)
        expect(share).toBeLessThanOrEqual(0.65)
      }
    }
  })

  it('narrows the framing rather than clip the drill in a slim panel', () => {
    const bounds = previewBoundsOf(3)
    const slim = { widthPixels: 200, heightPixels: 800 }
    const zoom = previewZoomOf(bounds, slim)
    expect((bounds.right - bounds.left) * zoom).toBeLessThanOrEqual(slim.widthPixels)
  })

  it('reaches out to the drill head in front of the body', () => {
    const bounds = previewBoundsOf(1)
    const bodyRight = Math.max(
      ...vehicleBodyQuadsOf(1).map((quad) => quad.centre[0] + quad.size[0] / 2),
    )
    expect(bounds.right).toBeGreaterThan(bodyRight)
  })

  it('lights at least one part for every track at every tier', () => {
    for (const tier of [1, 2, 3]) {
      for (const upgradeId of UPGRADE_IDS) {
        expect(partsAt(tier).some((quad) => isPartOfTrack(quad, upgradeId))).toBe(true)
      }
    }
  })

  it('lights every wheel for the engine and none with no track focused', () => {
    const wheels = partsAt(1).filter((quad) => quad.partId.includes('wheel'))
    expect(wheels.length).toBeGreaterThan(1)
    expect(wheels.every((quad) => isPartOfTrack(quad, 'engine'))).toBe(true)
    expect(partsAt(1).some((quad) => isPartOfTrack(quad, null))).toBe(false)
  })
})
