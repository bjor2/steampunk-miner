import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../scene/shippedArt'
import { artCatalogueOf, type ArtCatalogue } from '../art/artCatalogue'
import { assetQuadsOf } from '../art/assetLook'
import { slotOfPartId } from '../art/artIds'
import { vehicleSidecar, WHEEL_PART } from '../art/sidecarFixtures'
import type { PartSwapRequest } from '../registries/partMotionRequests'
import { lookBodyQuadsOf, lookPartIdsOf } from './lookPartQuads'
import { vehicleAttachPointOf } from './mountedPartLook'
import {
  drillHeadLookQuadsOf,
  drillHeadQuadsOf,
  vehicleBodyQuadsOf,
  vehiclePartIdsOf,
} from './vehicleLook'

const LOOK_ASSET_ID = 'vehicle-look-spec'
const TIERS = [1, 2, 3]

/** The shipped art plus one look asset of two parts, each authored with its slot at the origin. */
const artWithLook: ArtCatalogue = artCatalogueOf(
  [
    ...SHIPPED_ART.manifest.assets,
    {
      id: LOOK_ASSET_ID,
      source: 'blender',
      form: 'parts',
      status: 'placeholder',
      color: '#806040',
    },
  ],
  [
    ...SHIPPED_ART.placeholderSidecars,
    {
      ...vehicleSidecar([
        { ...WHEEL_PART, id: 'spec-drum', atM: [0, 0] },
        { ...WHEEL_PART, id: 'spec-crown', atM: [0, 0] },
      ]),
      assetId: LOOK_ASSET_ID,
      attach: undefined,
    },
  ],
  SHIPPED_ART.exportedSidecars,
)

const drumOnBoiler: PartSwapRequest = {
  kind: 'swap',
  attach: 'hull.boiler',
  partIds: ['spec-drum'],
  assetId: LOOK_ASSET_ID,
  replacesSlot: 'boiler',
}

const crownOnBit: PartSwapRequest = {
  kind: 'swap',
  attach: 'drill.head',
  partIds: ['spec-crown'],
  assetId: LOOK_ASSET_ID,
  replacesSlot: 'drill-bit',
}

const idsOf = (quads: readonly { partId: string }[]) => quads.map((quad) => quad.partId)
const slotsOf = (quads: readonly { partId: string }[]) => idsOf(quads).map(slotOfPartId)

describe('look part quads (ticket 640)', () => {
  it('draws exactly the old vehicle quads when no look is swapped in', () => {
    for (const tier of TIERS) {
      const all = assetQuadsOf(artWithLook, 'vehicle', tier, ['t3-drill-bit'])
      const drawn = [
        ...vehicleBodyQuadsOf(artWithLook, tier, ['t3-drill-bit'], []),
        ...drillHeadQuadsOf(artWithLook, tier, ['t3-drill-bit'], []),
      ]
      expect(JSON.stringify(vehicleBodyQuadsOf(artWithLook, tier, ['t3-drill-bit'], []))).toBe(
        JSON.stringify(vehicleBodyQuadsOf(artWithLook, tier, ['t3-drill-bit'])),
      )
      expect(idsOf(drawn).sort()).toEqual(idsOf(all).sort())
      expect(vehiclePartIdsOf(artWithLook, tier, ['t3-drill-bit'], [])).toEqual(idsOf(all))
    }
  })

  it('shows the look part at its point and hides the base part of the slot it stands in', () => {
    const [atX, atY] = vehicleAttachPointOf(artWithLook, 'hull.boiler')!.atM
    const [own] = assetQuadsOf(artWithLook, LOOK_ASSET_ID, 1).filter(
      (quad) => quad.partId === 'spec-drum',
    )
    const [look] = lookBodyQuadsOf(artWithLook, [drumOnBoiler])
    expect(look.assetId).toBe(LOOK_ASSET_ID)
    expect(look.quad.centre).toEqual([own.centre[0] + atX, own.centre[1] + atY])
    expect(slotsOf(vehicleBodyQuadsOf(artWithLook, 1, [], [drumOnBoiler]))).not.toContain('boiler')
    expect(slotsOf(vehicleBodyQuadsOf(artWithLook, 3, [], [drumOnBoiler]))).toContain('boiler-2')
  })

  it('lays a look that stands in no slot over the car, hiding nothing', () => {
    const overPod = { ...drumOnBoiler, attach: 'hull.plates', replacesSlot: undefined } as const
    expect(vehicleBodyQuadsOf(artWithLook, 1, [], [overPod])).toEqual(
      vehicleBodyQuadsOf(artWithLook, 1),
    )
    expect(idsOf(lookBodyQuadsOf(artWithLook, [overPod]).map((look) => look.quad))).toEqual([
      'spec-drum',
    ])
  })

  it('keeps the base part and draws nothing when the art lacks the look asset or its part', () => {
    const missingPart = { ...drumOnBoiler, partIds: ['spec-gone'] }
    for (const [art, look] of [
      [SHIPPED_ART, drumOnBoiler],
      [artWithLook, missingPart],
    ] as const) {
      expect(vehicleBodyQuadsOf(art, 1, [], [look])).toEqual(vehicleBodyQuadsOf(art, 1))
      expect(lookBodyQuadsOf(art, [look])).toEqual([])
      expect(lookPartIdsOf(art, [look])).toEqual([])
    }
  })

  it('carries a look standing in a drill slot on the swivelling head, placed like its parts', () => {
    const head = drillHeadQuadsOf(artWithLook, 1, [], [crownOnBit])
    const [crown] = drillHeadLookQuadsOf(artWithLook, 1, [], [crownOnBit])
    const plate = assetQuadsOf(artWithLook, 'vehicle', 1).find(
      (quad) => quad.partId === 't1-drill-head',
    )!
    const [atX, atY] = vehicleAttachPointOf(artWithLook, 'drill.head')!.atM
    expect(slotsOf(head)).not.toContain('drill-bit')
    expect(lookBodyQuadsOf(artWithLook, [crownOnBit])).toEqual([])
    expect(crown.quad.z).toBe(WHEEL_PART.z - plate.z)
    expect(crown.quad.pivot).toEqual([atX - plate.centre[0], atY - plate.centre[1]])
  })

  it('draws every part once: no look twice and no base part under its look', () => {
    const looks = [drumOnBoiler, crownOnBit]
    for (const tier of TIERS) {
      const drawn = [
        ...idsOf(vehicleBodyQuadsOf(artWithLook, tier, [], looks)),
        ...idsOf(drillHeadQuadsOf(artWithLook, tier, [], looks)),
        ...lookPartIdsOf(artWithLook, looks),
      ]
      expect(new Set(drawn).size).toBe(drawn.length)
      expect(drawn.map(slotOfPartId)).not.toContain('boiler')
      expect(drawn.map(slotOfPartId)).not.toContain('drill-bit')
      expect(lookPartIdsOf(artWithLook, looks).sort()).toEqual([
        `${LOOK_ASSET_ID}/spec-crown`,
        `${LOOK_ASSET_ID}/spec-drum`,
      ])
    }
  })
})
