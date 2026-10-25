/**
 * Where each crater decal sits on the `prop-blast-crater` atlas (D7, ticket 866): the maps the
 * decal pool samples and each part's texture rectangle, from the exported sidecar through the
 * kernel's asset look. Null while the asset is a placeholder, so the layer draws no decal rather
 * than a flat square.
 */
import type { ArtCatalogue } from '../../../../systems/art/artCatalogue'
import {
  assetQuadsOf,
  atlasMapsOf,
  type AtlasMaps,
  type AtlasUv,
} from '../../../../systems/art/assetLook'
import { BLAST_CRATER_ASSET_ID } from './dynamiteArt'

/** The decals are authored untiered: one look. */
const ONLY_LOOK = 1

export interface CraterAtlas {
  maps: AtlasMaps
  /** By part id, `[left, bottom, right, top]`. */
  uvByPart: Readonly<Record<string, AtlasUv>>
}

export function craterAtlasOf(art: ArtCatalogue): CraterAtlas | null {
  const maps = atlasMapsOf(art, BLAST_CRATER_ASSET_ID)
  if (maps === null) return null
  const uvByPart: Record<string, AtlasUv> = {}
  for (const quad of assetQuadsOf(art, BLAST_CRATER_ASSET_ID, ONLY_LOOK)) {
    if (quad.uv !== null) uvByPart[quad.partId] = quad.uv
  }
  return { maps, uvByPart }
}
