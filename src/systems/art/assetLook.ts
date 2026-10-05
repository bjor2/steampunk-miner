/**
 * What a Blender parts asset draws (#52, #51): once its manifest entry is `final`, the parts of its
 * exported sidecar, each a quad cut from the KTX2 atlas; until then the placeholder quads of
 * `placeholderLook`. Every quad keeps its placeholder colour, so a final part can still draw flat
 * while its maps load. The run vehicle and the Upgrade bay preview read the same quads (#44, #51
 * acceptance 4).
 */
import { exportedSidecarOf, manifestEntryOf } from './artCatalogue'
import { folderOfEntry, type ManifestEntry } from './assetManifest'
import type { PartsSidecar, Pair, SidecarPart } from './partsSidecar'
import {
  colouredQuadOf,
  partsShownAtTier,
  placeholderQuadsOf,
  type PlaceholderQuad,
} from './placeholderLook'

/**
 * Texture coordinates of a part's atlas rectangle, `[left, bottom, right, top]`. KTX2 maps are
 * uploaded unflipped with the image's top row first (toktx's default orientation), so `v` counts
 * down from the top: a quad's top edge samples `top`, which is the smaller `v`.
 */
export type AtlasUv = readonly [number, number, number, number]

export interface AssetQuad extends PlaceholderQuad {
  /** Null while the asset is a placeholder: draw the flat colour. */
  uv: AtlasUv | null
}

/** Map URLs relative to the page, so they resolve on the dev server and from file:// alike. */
export interface AtlasMaps {
  albedo: string
  normal: string
  emissive: string | null
}

const PUBLIC_FOLDER = 'public/'

/** The quads an asset shows at a visual tier, lowest draw order first. */
export function assetQuadsOf(assetId: string, tier: number): AssetQuad[] {
  const entry = manifestEntryOf(assetId)
  const sidecar = finalSidecarOf(entry)
  if (entry === null || sidecar === null) return placeholderQuadsOf(assetId, tier).map(withoutAtlas)
  return partsShownAtTier(sidecar.parts, tier).map((part) => atlasQuadOf(entry, sidecar, part))
}

/** The maps a final asset draws with, or null while it is a placeholder. */
export function atlasMapsOf(assetId: string): AtlasMaps | null {
  const entry = manifestEntryOf(assetId)
  const sidecar = finalSidecarOf(entry)
  const folder = entry === null ? null : folderOfEntry(entry)
  if (sidecar === null || folder === null) return null
  return mapUrlsIn(folder.slice(PUBLIC_FOLDER.length), sidecar.maps)
}

/** Where a pixel rectangle (from the atlas's top-left) sits in texture coordinates. */
export function atlasUvOf(rect: SidecarPart['rect'], [width, height]: Pair): AtlasUv {
  const [x, y, w, h] = rect
  return [x / width, (y + h) / height, (x + w) / width, y / height]
}

function finalSidecarOf(entry: ManifestEntry | null): PartsSidecar | null {
  return entry?.status === 'final' ? exportedSidecarOf(entry.id) : null
}

function withoutAtlas(quad: PlaceholderQuad): AssetQuad {
  return { ...quad, uv: null }
}

function atlasQuadOf(entry: ManifestEntry, sidecar: PartsSidecar, part: SidecarPart): AssetQuad {
  return { ...colouredQuadOf(entry, part), uv: atlasUvOf(part.rect, sidecar.atlasPx) }
}

function mapUrlsIn(folder: string, maps: PartsSidecar['maps']): AtlasMaps {
  return {
    albedo: folder + maps.albedo,
    normal: folder + maps.normal,
    emissive: maps.emissive === false ? null : folder + maps.emissive,
  }
}
