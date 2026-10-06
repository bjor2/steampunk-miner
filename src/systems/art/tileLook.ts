/**
 * What a `tile` asset draws with (#52 "Ground and casing"): once its manifest entry is `final`, its
 * tileable albedo and normal maps, 4 x 4 m each (and an emissive map if it glows); until then nothing, and the terrain keeps its flat
 * band colours. The ground draws its five strata only when every band's maps ship, so a half-done
 * export never mixes textured and flat bands.
 */
import { manifestEntryOf, type ArtCatalogue } from './artCatalogue'
import { LAVA_TILE_ASSET_ID, refractoryCasingTileIds } from './artIds'
import { folderOfEntry, type ManifestEntry } from './assetManifest'
import { BAND_COUNT } from '../world/planetGeometry'

/** Map URLs relative to the page, so they resolve on the dev server and from file:// alike. */
export interface TileMaps {
  albedo: string
  normal: string
}

const PUBLIC_FOLDER = 'public/'

/** The maps of a final tile asset, or null for a placeholder, another form or an unknown id. */
export function tileMapsOf(art: ArtCatalogue, assetId: string): TileMaps | null {
  const entry = finalTileEntryOf(art, assetId)
  if (entry === null) return null
  const stem = mapStemOf(entry)
  return { albedo: `${stem}.albedo.ktx2`, normal: `${stem}.normal.ktx2` }
}

/** The emissive map of a final tile that glows (refractory seams, lava; #113), or null. */
export function tileEmissiveMapOf(art: ArtCatalogue, assetId: string): string | null {
  const entry = finalTileEntryOf(art, assetId)
  return entry?.emissive === true ? `${mapStemOf(entry)}.emissive.ktx2` : null
}

function finalTileEntryOf(art: ArtCatalogue, assetId: string): ManifestEntry | null {
  const entry = manifestEntryOf(art, assetId)
  return entry?.form === 'tile' && entry.status === 'final' ? entry : null
}

function mapStemOf(entry: ManifestEntry): string {
  const folder = folderOfEntry(entry)?.slice(PUBLIC_FOLDER.length) ?? ''
  return `${folder}${entry.id}`
}

/** Bands 1 to 5 in order, or null unless all five are final. */
export function groundStrataMapsOf(art: ArtCatalogue): TileMaps[] | null {
  const maps = groundBandIds().map((bandId) => tileMapsOf(art, bandId))
  return maps.every(isShipped) ? maps : null
}

function groundBandIds(): string[] {
  return Array.from({ length: BAND_COUNT }, (_, at) => `ground-band-${at + 1}`)
}

/** The heat planets' glowing tiles (#113, #114): lava, and refractory lining, albedo and glow. */
export interface HeatTileMaps {
  lava: TileMaps
  lavaEmissive: string
  refractory: TileMaps
  refractoryEmissive: string
}

/**
 * The lava tile and the first refractory grade's tile with their glow maps, or null unless all
 * four are final. The terrain draws every refractory grade with the first grade's brick for now:
 * the type reads by brick and glow, the grade's ironwork is not drawn yet.
 */
export function heatTileMapsOf(art: ArtCatalogue): HeatTileMaps | null {
  const [refractoryId] = refractoryCasingTileIds()
  const lava = tileMapsOf(art, LAVA_TILE_ASSET_ID)
  const lavaEmissive = tileEmissiveMapOf(art, LAVA_TILE_ASSET_ID)
  const refractory = tileMapsOf(art, refractoryId)
  const refractoryEmissive = tileEmissiveMapOf(art, refractoryId)
  if (
    lava === null ||
    refractory === null ||
    lavaEmissive === null ||
    refractoryEmissive === null
  ) {
    return null
  }
  return { lava, lavaEmissive, refractory, refractoryEmissive }
}

function isShipped(maps: TileMaps | null): maps is TileMaps {
  return maps !== null
}
