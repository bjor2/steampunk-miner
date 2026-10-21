import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { exportedSidecarOf, manifestEntryOf } from '../../../systems/art/artCatalogue'
import { blenderAssetIds, slotOfPartId } from '../../../systems/art/artIds'
import { lookBodyQuadsOf } from '../../../systems/render/lookPartQuads'
import { vehicleAttachPointOf } from '../../../systems/render/mountedPartLook'
import { vehicleBodyQuadsOf } from '../../../systems/render/vehicleLook'
import { RIG_LOOK_TABLE } from './rigLookTable'

const LOOK_ASSET_IDS = Object.keys(RIG_LOOK_TABLE.lookAssets)

describe('rig look art (ticket 640)', () => {
  it('ships the boiler, cargo hold, drill tip, engine and hull look assets through r.artAssets', () => {
    expect(LOOK_ASSET_IDS).toEqual([
      'vehicle-look-boiler',
      'vehicle-look-cargo-hold',
      'vehicle-look-drill-tip',
      'vehicle-look-engine',
      'vehicle-look-hull',
    ])
    expect(blenderAssetIds()).toEqual(expect.arrayContaining(LOOK_ASSET_IDS))
  })

  it.each(LOOK_ASSET_IDS)(
    'exports %s as final art with exactly the parts the table names',
    (id) => {
      const sidecar = exportedSidecarOf(SHIPPED_ART, id)
      expect(manifestEntryOf(SHIPPED_ART, id)?.status).toBe('final')
      expect(sidecar?.parts.map((part) => part.id).sort()).toEqual(
        [...RIG_LOOK_TABLE.lookAssets[id]].sort(),
      )
    },
  )

  it.each(LOOK_ASSET_IDS)("authors every %s part with its track's slot at the origin", (id) => {
    const parts = exportedSidecarOf(SHIPPED_ART, id)?.parts ?? []
    expect(parts.map((part) => part.atM)).toEqual(parts.map(() => [0, 0]))
  })

  it('draws the twin-drum boiler on hull.boiler in place of the rig boiler', () => {
    const look = {
      kind: 'swap',
      attach: 'hull.boiler',
      partIds: ['twin-drum-boiler'],
      assetId: 'vehicle-look-boiler',
      replacesSlot: 'boiler',
    } as const
    const [drawn] = lookBodyQuadsOf(SHIPPED_ART, [look])
    expect(drawn.quad.pivot).toEqual(vehicleAttachPointOf(SHIPPED_ART, 'hull.boiler')?.atM)
    expect(drawn.quad.uv).not.toBeNull()
    const slots = vehicleBodyQuadsOf(SHIPPED_ART, 1, [], [look]).map((q) => slotOfPartId(q.partId))
    expect(slots).not.toContain('boiler')
  })
})
