/**
 * The magnetic planet's Blender asset (GD ruling on #293 Q1, "the Blender plan stands"): one
 * `parts` asset under `public/assets/prop/`, registered through `r.artAssets` (#214), holding the
 * aurora's ribbon, which the kernel's planet sky band repeats round the planet, and the field
 * lines' dash, which the field-line layer repeats along each arc. Only their light and shape come
 * from the art; their colour is the look's (`magneticLooks.json`). The electrified cells' arcs stay
 * procedural in the terrain shader, as every #299 marker is.
 */
import type { ArtCatalogue } from '../../../../systems/art/artCatalogue'
import { assetQuadsOf, atlasMapsOf, type AtlasUv } from '../../../../systems/art/assetLook'
import type { ArtAsset } from '../../../../systems/registries/artAssets'

export const MAGNETIC_FIELD_ASSET_ID = 'prop-magnetic-field'

/** Curtains of light rising from the lower edge, repeated end to end round the planet. */
export const AURORA_RIBBON_PART_ID = 'aurora-ribbon'

/** One dash and its gap, repeated along a field line. */
export const FIELD_DASH_PART_ID = 'field-dash'

export function magneticArtAssets(): ArtAsset[] {
  return [
    {
      id: MAGNETIC_FIELD_ASSET_ID,
      category: 'prop',
      parts: [AURORA_RIBBON_PART_ID, FIELD_DASH_PART_ID],
    },
  ]
}

/** The dash's map and its rectangle once the asset is final. */
export interface FieldDashArt {
  /** The dash's glow where the bake has one, else its colour. */
  map: string
  uv: AtlasUv
}

/** A non-tiered asset shows every part at any tier. */
const ANY_TIER = 1

/** The dash's art once the asset is final; null draws the layer's procedural dashes. */
export function fieldDashArtOf(art: ArtCatalogue): FieldDashArt | null {
  const maps = atlasMapsOf(art, MAGNETIC_FIELD_ASSET_ID)
  const dash = assetQuadsOf(art, MAGNETIC_FIELD_ASSET_ID, ANY_TIER).find(
    (quad) => quad.partId === FIELD_DASH_PART_ID,
  )
  if (maps === null || dash === undefined || dash.uv === null) return null
  return { map: maps.emissive ?? maps.albedo, uv: dash.uv }
}
