import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { artCatalogueOf } from '../art/artCatalogue'
import { assetQuadsOf } from '../art/assetLook'
import { vehicleSidecar } from '../art/sidecarFixtures'
import { mountedPartQuadsOf, vehicleAttachPointOf } from './mountedPartLook'

// The #166 echo sounder on its own point (#162 mortar pick: the horn keeps `hull.roof.aft`).
const SOUNDER = { assetId: 'vehicle-item-power-echo-sounder', attachId: 'hull.roof.aft' } as const

const vehicleWithNoPoints = () => artCatalogueOf([], [{ ...vehicleSidecar(), attach: [] }], [])

describe('mounted part look (#235)', () => {
  it('reads the attach point from the shipped base vehicle', () => {
    expect(vehicleAttachPointOf(SHIPPED_ART, 'hull.roof.aft')).toMatchObject({
      id: 'hull.roof.aft',
    })
  })

  it('moves every part of the asset to the point, keeping its size and draw order', () => {
    const [atX, atY] = vehicleAttachPointOf(SHIPPED_ART, SOUNDER.attachId)!.atM
    const own = assetQuadsOf(SHIPPED_ART, SOUNDER.assetId, 1)
    const mounted = mountedPartQuadsOf(SHIPPED_ART, SOUNDER)
    expect(own.length).toBeGreaterThan(0)
    expect(mounted).toEqual(
      own.map((quad) => ({
        ...quad,
        centre: [quad.centre[0] + atX, quad.centre[1] + atY],
        pivot: [quad.pivot[0] + atX, quad.pivot[1] + atY],
      })),
    )
  })

  it('draws nothing at a point the vehicle does not place', () => {
    expect(mountedPartQuadsOf(vehicleWithNoPoints(), SOUNDER)).toEqual([])
  })
})
