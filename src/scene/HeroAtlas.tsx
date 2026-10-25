/**
 * Swaps the per-act hero atlas into the terrain material (ticket 451; TD shape 6226270701 "#451
 * shape" item 4, Vertical Scaler 4): the atlas changes only when the planet change lands on
 * another act, since the provider hands every planet of an act the same atlas and the subtree is
 * keyed by its act. The old subtree unmounts first, unbinding and disposing its pages, before the
 * next act's load and bind, so one act's pages are resident at a time, all of them together as
 * the layers of one texture (ticket 852). Heroes draw the shader look until they transcode, and
 * nothing waits on them. Mounted only where the probe gave the atlas its unit.
 */
import { Suspense, useEffect, useMemo } from 'react'
import type { ShaderMaterial } from 'three'
import { useGameStore } from '../store/gameStore'
import { kindLookProvider } from '../systems/registries/kindLook'
import { drawnHeroAtlasOf, type DrawnHeroAtlas } from '../systems/render/heroAtlas'
import { clearKtx2Map, useAtlasTextureSet } from './atlasTextures'
import { SHIPPED_ART } from './shippedArt'
import { bindHeroAtlas, releaseHeroAtlas } from './terrainHeroAtlas'

interface HeroAtlasProps {
  material: ShaderMaterial
}

export function HeroAtlas({ material }: HeroAtlasProps) {
  const atlas = useGameStore((state) => kindLookProvider()?.heroAtlasOf(state.planetTier) ?? null)
  const drawn = useMemo(() => drawnHeroAtlasOf(atlas, SHIPPED_ART), [atlas])
  if (drawn === null) return null
  return (
    <Suspense key={drawn.id} fallback={null}>
      <LoadedHeroAtlas atlas={drawn} material={material} />
    </Suspense>
  )
}

function LoadedHeroAtlas({ atlas, material }: HeroAtlasProps & { atlas: DrawnHeroAtlas }) {
  const pages = useAtlasTextureSet(atlas.albedos)
  useEffect(() => {
    const layers = bindHeroAtlas(material, pages, atlas)
    return () => {
      releaseHeroAtlas(material, layers, pages)
      atlas.albedos.forEach(clearKtx2Map)
    }
  }, [material, pages, atlas])
  return null
}
