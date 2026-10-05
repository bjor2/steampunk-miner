/**
 * One part of a Blender asset: cut from its atlas once the asset is final, a flat placeholder quad
 * until then and while the atlas loads, so the scene never waits on art (#52 "Placeholders").
 */
import { Suspense } from 'react'
import type { AssetQuad, AtlasMaps, AtlasUv } from '../systems/art/assetLook'
import { AtlasQuadMesh } from './AtlasQuadMesh'
import { PlaceholderQuadMesh } from './PlaceholderQuadMesh'

interface PartQuadMeshProps {
  quad: AssetQuad
  maps: AtlasMaps | null
  baseZ: number
}

export function PartQuadMesh({ quad, maps, baseZ }: PartQuadMeshProps) {
  const placeholder = <PlaceholderQuadMesh quad={quad} baseZ={baseZ} />
  if (maps === null || !isCutFromAtlas(quad)) return placeholder
  return (
    <Suspense fallback={placeholder}>
      <AtlasQuadMesh quad={quad} maps={maps} baseZ={baseZ} />
    </Suspense>
  )
}

function isCutFromAtlas(quad: AssetQuad): quad is AssetQuad & { uv: AtlasUv } {
  return quad.uv !== null
}
