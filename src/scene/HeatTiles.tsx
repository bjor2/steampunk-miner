/**
 * Loads the heat planets' lava and refractory lining tiles (#113, #114) into the terrain material
 * once they ship as final art, and only on a heat planet, so the other planets never fetch them.
 */
import { Suspense, useEffect, useMemo } from 'react'
import type { ShaderMaterial } from 'three'
import { heatTileMapsOf, type HeatTileMaps } from '../systems/art/tileLook'
import { useAtlasTextureSet } from './atlasTextures'
import { SHIPPED_ART } from './shippedArt'
import { bindHeatTiles, heatTileUrlsOf, unbindHeatTiles } from './terrainHeatTiles'

interface HeatTilesProps {
  material: ShaderMaterial
  isHeatPlanet: boolean
}

export function HeatTiles({ material, isHeatPlanet }: HeatTilesProps) {
  const maps = useMemo(() => heatTileMapsOf(SHIPPED_ART), [])
  if (maps === null || !isHeatPlanet) return null
  return (
    <Suspense fallback={null}>
      <LoadedHeatTiles maps={maps} material={material} />
    </Suspense>
  )
}

function LoadedHeatTiles({ maps, material }: { maps: HeatTileMaps; material: ShaderMaterial }) {
  const urls = useMemo(() => heatTileUrlsOf(maps), [maps])
  const textures = useAtlasTextureSet(urls)
  useEffect(() => {
    bindHeatTiles(material, textures)
    return () => unbindHeatTiles(material)
  }, [material, textures])
  return null
}
