import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { exportedSidecarOf, manifestEntryOf } from '../../../systems/art/artCatalogue'
import { blenderAssetIds, slotOfPartId } from '../../../systems/art/artIds'
import { lookBodyQuadsOf } from '../../../systems/render/lookPartQuads'
import { vehicleAttachPointOf } from '../../../systems/render/mountedPartLook'
import { vehicleBodyQuadsOf } from '../../../systems/render/vehicleLook'
import { RIG_LOOK_TABLE } from './rigLookTable'

const LOOK_ASSET_IDS = Object.keys(RIG_LOOK_TABLE.lookAssets)
/** The drill types' asset (ticket 622): its cutter arms are authored with their hinge as origin. */
const DRILL_TYPE_ASSET_ID = 'vehicle-look-drill-type'
/** Each hinged part's origin in the slot's frame: the hinge blocks of #622's `drillTypeLooks.json`. */
const DRILL_TYPE_HINGES: Readonly<Record<string, readonly [number, number]>> = {
  'cutter-arm-up-1': [0.06, 0.03],
  'cutter-arm-up-2': [0.06, 0.03],
  'cutter-arm-down-1': [0.06, -0.03],
  'cutter-arm-down-2': [0.06, -0.03],
}

describe('rig look art (ticket 640)', () => {
  it('ships the boiler, cargo hold, drill power, drill tip, drill type, drive and hull look assets through r.artAssets', () => {
    expect(LOOK_ASSET_IDS).toEqual([
      'vehicle-look-boiler',
      'vehicle-look-cargo-hold',
      'vehicle-look-drill-power',
      'vehicle-look-drill-tip',
      'vehicle-look-drill-type',
      'vehicle-look-drive',
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
    const origins = parts.map((part) =>
      id === DRILL_TYPE_ASSET_ID ? DRILL_TYPE_HINGES[part.id] : null,
    )
    expect(parts.map((part) => part.atM)).toEqual(origins.map((hinge) => hinge ?? [0, 0]))
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
