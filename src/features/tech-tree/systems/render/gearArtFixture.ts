/**
 * The gear specs' art (#166, ticket 250): every gear asset as a final export whose parts are one
 * 0.2 m square each, pivot at the centre, at the asset's origin, and a base vehicle carrying the
 * attach points a spec names, so a spec can leave a point out.
 */
import type { ArtCatalogue } from '../../../../systems/art/artCatalogue'
import type { PartsSidecar, SidecarPart } from '../../../../systems/art/partsSidecar'
import { gearAssetIds, gearPartIdsOf } from './techGear'

export interface FixturePoint {
  id: string
  atM: readonly [number, number]
  z: number
}

export const GEAR_PART_SIDE_M = 0.2

export const GEAR_ART: ArtCatalogue = {
  manifest: {
    assets: gearAssetIds().map((id) => ({
      id,
      source: 'blender',
      form: 'parts',
      status: 'final',
    })),
  },
  placeholderSidecars: [],
  exportedSidecars: gearAssetIds().map((id) => sidecarOf(id, gearPartIdsOf(id))),
}

export function vehicleWithPoints(points: readonly FixturePoint[]): PartsSidecar {
  return {
    ...sidecarOf('vehicle', ['t1-chassis']),
    attach: points.map((point) => ({ ...point, atM: [...point.atM] })),
  }
}

function sidecarOf(assetId: string, partIds: readonly string[]): PartsSidecar {
  return {
    assetId,
    schema: 1,
    source: { blend: `art/blender/${assetId}/${assetId}.blend`, sha256: 'x', blender: '4.2.9' },
    pxPerMetre: 512,
    atlasPx: [4096, 128],
    maps: { albedo: `${assetId}.albedo.ktx2`, normal: `${assetId}.normal.ktx2`, emissive: false },
    parts: partIds.map(squarePart),
  }
}

function squarePart(id: string, at: number): SidecarPart {
  const side = GEAR_PART_SIDE_M
  return {
    id,
    tier: 1,
    rect: [at * 110, 0, 100, 100],
    sizeM: [side, side],
    pivotM: [side / 2, side / 2],
    atM: [0, 0],
    z: 1,
  }
}
