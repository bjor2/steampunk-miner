/**
 * The star map carousel's sprites as images (ticket 796, drawing ticket 795's art): each first-
 * system preview's hero and orbit dot, and the system strip's backdrop, frame, here ring and
 * selected marker. A preview is content keyed by planet, not a design token, so the chart draws
 * it from the catalogue (`uiPartImageOf`); a sprite whose asset is still a placeholder is null,
 * and the chart keeps its CSS stand-in (the tinted glyph, a plain rail). Pure: the catalogue and
 * the page's assets URL come in.
 */
import type { ArtCatalogue } from './artCatalogue'
import {
  firstSystemPreviewAssetIds,
  STAR_MAP_SYSTEM_ASSET_ID,
  starMapDotPartIdOf,
  type StarMapSystemPartSuffix,
} from './starMapCarouselArt'
import { UI_ASSETS_URL, uiPartImageOf, type UiPartImage } from './uiArt'

export interface StarMapPreviewImages {
  hero: UiPartImage | null
  dot: UiPartImage | null
}

export interface StarMapCarouselImages {
  /** By preview asset id. */
  previews: Readonly<Record<string, StarMapPreviewImages>>
  backdrop: UiPartImage | null
  frame: UiPartImage | null
  here: UiPartImage | null
  selected: UiPartImage | null
}

export const NO_PREVIEW_IMAGES: StarMapPreviewImages = { hero: null, dot: null }

export function starMapCarouselImagesOf(
  art: ArtCatalogue,
  assetsUrl: string = UI_ASSETS_URL,
): StarMapCarouselImages {
  const systemPart = (suffix: StarMapSystemPartSuffix) =>
    uiPartImageOf(art, STAR_MAP_SYSTEM_ASSET_ID, `${STAR_MAP_SYSTEM_ASSET_ID}-${suffix}`, assetsUrl)
  return {
    previews: previewImagesOf(art, assetsUrl),
    backdrop: uiPartImageOf(art, STAR_MAP_SYSTEM_ASSET_ID, STAR_MAP_SYSTEM_ASSET_ID, assetsUrl),
    frame: systemPart('frame'),
    here: systemPart('here'),
    selected: systemPart('selected'),
  }
}

/** A preview's images; none for a planet whose look the kernel cannot name. */
export function previewImagesAt(
  images: StarMapCarouselImages,
  previewAssetId: string | null,
): StarMapPreviewImages {
  if (previewAssetId === null) return NO_PREVIEW_IMAGES
  return images.previews[previewAssetId] ?? NO_PREVIEW_IMAGES
}

function previewImagesOf(
  art: ArtCatalogue,
  assetsUrl: string,
): Record<string, StarMapPreviewImages> {
  return Object.fromEntries(
    firstSystemPreviewAssetIds().map((assetId) => [
      assetId,
      {
        hero: uiPartImageOf(art, assetId, assetId, assetsUrl),
        dot: uiPartImageOf(art, assetId, starMapDotPartIdOf(assetId), assetsUrl),
      },
    ]),
  )
}
