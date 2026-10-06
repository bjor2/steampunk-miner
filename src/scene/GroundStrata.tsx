/**
 * Loads the five ground strata maps (S7d) into the terrain material once every band's art is
 * final. The terrain draws flat band colours until they transcode, so nothing waits on them.
 */
import { Suspense, useEffect, useMemo } from 'react'
import type { ShaderMaterial } from 'three'
import { groundStrataMapsOf, type TileMaps } from '../systems/art/tileLook'
import { useAtlasTextureSet } from './atlasTextures'
import { SHIPPED_ART } from './shippedArt'
import { bindStrataMaps, strataMapUrlsOf, unbindStrataMaps } from './terrainStrata'

interface GroundStrataProps {
  material: ShaderMaterial
}

export function GroundStrata({ material }: GroundStrataProps) {
  const strata = useMemo(() => groundStrataMapsOf(SHIPPED_ART), [])
  if (strata === null) return null
  return (
    <Suspense fallback={null}>
      <LoadedGroundStrata strata={strata} material={material} />
    </Suspense>
  )
}

function LoadedGroundStrata({ strata, material }: GroundStrataProps & { strata: TileMaps[] }) {
  const urls = useMemo(() => strataMapUrlsOf(strata), [strata])
  const textures = useAtlasTextureSet(urls)
  useEffect(() => {
    bindStrataMaps(material, textures)
    return () => unbindStrataMaps(material)
  }, [material, textures])
  return null
}
