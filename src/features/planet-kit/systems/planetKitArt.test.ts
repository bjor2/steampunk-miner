import { describe, expect, it } from 'vitest'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { blenderAssetIds, isValidPartId } from '../../../systems/art/artIds'
import {
  exportedSidecarOf,
  manifestEntryOf,
  placeholderSidecarOf,
} from '../../../systems/art/artCatalogue'
import { sidecarProblems } from '../../../systems/art/partsSidecar'
import { MAX_DOCK_ADD_ON_PARTS } from '../../dock-buildings'
import { CACHE_CRATE_ASSET_ID } from './cacheCrateArt'
import { MERCHANT_ART } from './merchantArt'
import { planetKitArtAssets } from './planetKitArt'

// The planet-kit slice's Blender assets (ticket 825): the kit sockets' parts, the merchant frontages
// and the Cache Crate prop, registered through r.artAssets (#214) and shipped final, each sidecar
// valid under schema 1 with exactly the parts the slice names.

const ASSETS = planetKitArtAssets()

/** A platform or prop asset's shell is a part named for the asset; a vehicle item's parts are all named. */
function partIdsOf(asset: (typeof ASSETS)[number]): string[] {
  const shell = asset.category === 'vehicle' ? [] : [asset.id]
  return [...shell, ...(asset.parts ?? [])].sort()
}

describe('planet-kit art', () => {
  it('registers the four sockets, the five frontages and the crate prop', () => {
    expect(ASSETS.map((asset) => asset.id)).toEqual([
      'vehicle-item-scree-plough',
      'vehicle-item-damp-flask',
      'vehicle-item-shard-tongs',
      'vehicle-item-vent-vane',
      'platform-merchant-1',
      'platform-merchant-2',
      'platform-merchant-3',
      'platform-merchant-4',
      'platform-merchant-5',
      CACHE_CRATE_ASSET_ID,
    ])
  })

  it('joins the Blender asset list, so the lint and the export accept every id and part', () => {
    expect(blenderAssetIds()).toEqual(expect.arrayContaining(ASSETS.map((asset) => asset.id)))
    for (const asset of ASSETS) {
      for (const partId of asset.parts ?? [])
        expect(isValidPartId(asset.id, partId), partId).toBe(true)
    }
  })

  it.each(ASSETS.map((asset) => [asset.id, asset] as const))(
    'ships %s final with exactly its parts, the placeholder and the export alike',
    (id, asset) => {
      expect(manifestEntryOf(SHIPPED_ART, id)?.status).toBe('final')
      const placeholder = placeholderSidecarOf(SHIPPED_ART, id)
      const exported = exportedSidecarOf(SHIPPED_ART, id)
      expect(placeholder).not.toBeNull()
      expect(exported).not.toBeNull()
      for (const sidecar of [placeholder!, exported!]) {
        expect(sidecar.parts.map((part) => part.id).sort()).toEqual(partIdsOf(asset))
        expect(sidecarProblems(id, sidecar)).toEqual([])
      }
    },
  )

  it('keeps each frontage to the in-place add-on’s two parts (#170 amendment)', () => {
    for (const frontage of MERCHANT_ART.frontages) {
      const exported = exportedSidecarOf(SHIPPED_ART, frontage.assetId)!
      expect(exported.parts.length).toBeLessThanOrEqual(MAX_DOCK_ADD_ON_PARTS)
    }
  })

  it('authors every socket part in its own frame with the attach point inside the asset’s parts', () => {
    for (const asset of ASSETS.filter((candidate) => candidate.category === 'vehicle')) {
      const exported = exportedSidecarOf(SHIPPED_ART, asset.id)!
      const left = Math.min(...exported.parts.map((part) => part.atM[0] - part.pivotM[0]))
      const right = Math.max(
        ...exported.parts.map((part) => part.atM[0] - part.pivotM[0] + part.sizeM[0]),
      )
      const bottom = Math.min(...exported.parts.map((part) => part.atM[1] - part.pivotM[1]))
      const top = Math.max(
        ...exported.parts.map((part) => part.atM[1] - part.pivotM[1] + part.sizeM[1]),
      )
      expect(left, asset.id).toBeLessThanOrEqual(0)
      expect(right, asset.id).toBeGreaterThanOrEqual(0)
      expect(bottom, asset.id).toBeLessThanOrEqual(0)
      expect(top, asset.id).toBeGreaterThanOrEqual(0)
    }
  })
})
