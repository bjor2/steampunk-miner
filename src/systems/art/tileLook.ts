/**
 * What a `tile` asset draws with (#52 "Ground and casing"): once its manifest entry is `final`, its
 * tileable albedo and normal maps, 4 x 4 m each (and an emissive map if it glows); until then nothing, and the terrain keeps its flat
 * band colours. The ground draws its five strata only when every band's maps ship, so a half-done
 * export never mixes textured and flat bands.
 */
import { manifestEntryOf, type ArtCatalogue } from './artCatalogue'
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

function isShipped(maps: TileMaps | null): maps is TileMaps {
  return maps !== null
}
