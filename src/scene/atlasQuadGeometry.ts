/** A part's quad in metres, centred on the origin, its texture coordinates on its atlas rect. */
import { PlaneGeometry } from 'three'
import type { AssetQuad, AtlasUv } from '../systems/art/assetLook'

/** PlaneGeometry's corners run top-left, top-right, bottom-left, bottom-right. */
export function createAtlasQuad(quad: AssetQuad & { uv: AtlasUv }): PlaneGeometry {
  const geometry = new PlaneGeometry(quad.size[0], quad.size[1])
  const [left, bottom, right, top] = quad.uv
  geometry.attributes.uv.array.set([left, top, right, top, left, bottom, right, bottom])
  return geometry
}
