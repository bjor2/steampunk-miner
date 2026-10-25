/**
 * The terrain material's hero atlas (ticket 451; TD shape 6226270701 "#451 shape"): the ONLY
 * writer of `uHeroAtlas` and `heroAtlasPresence`. One act's pages are resident at a time, stacked
 * as the layers of one texture (ticket 852): the old act's are unbound and disposed before the
 * next are bound, and the look table carries no atlas cell until they are, so a hero never samples
 * a released texture. Pages the GPU would hold as RGBA8 are refused and disposed, and every hero
 * keeps the shader look (no RGBA8 fallback, TD #470).
 */
import type { IUniform, ShaderMaterial, Texture } from 'three'
import type { HeroAtlasUnit } from '../systems/render/gpuTier'
import type { DrawnHeroAtlas } from '../systems/render/heroAtlas'
import { heroAtlasLayersOf } from './heroAtlasLayers'
import { heroAtlasPresence, NO_HERO_CELLS_BOUND } from './heroAtlasPresence'

export function createHeroAtlasUniforms(): Record<string, IUniform> {
  return { uHeroAtlas: { value: null } }
}

/** What the probe chose for the session's terrain material, for the debug reads. */
export function noteHeroAtlasUnit(unit: HeroAtlasUnit): void {
  heroAtlasPresence.unit = unit
}

/**
 * Stacks the transcoded pages and binds them, answering the bound texture to release later; null
 * when the pages were refused (then they are disposed here).
 */
export function bindHeroAtlas(
  material: ShaderMaterial,
  pages: readonly Texture[],
  atlas: DrawnHeroAtlas,
): Texture | null {
  const layers = heroAtlasLayersOf(pages)
  if (layers === null) {
    refuseHeroAtlas(pages, atlas)
    return null
  }
  material.uniforms.uHeroAtlas.value = layers
  heroAtlasPresence.residentId = atlas.id
  heroAtlasPresence.pages = pages.length
  heroAtlasPresence.heroCells = atlas.heroCells
  heroAtlasPresence.firstHueTintedCell = atlas.firstHueTintedCell
  heroAtlasPresence.binds++
  return layers
}

/** Unbinds the layers if they are the bound ones, then frees them and the pages they came from. */
export function releaseHeroAtlas(
  material: ShaderMaterial,
  layers: Texture | null,
  pages: readonly Texture[],
): void {
  if (layers !== null && material.uniforms.uHeroAtlas.value === layers) unbindHeroAtlas(material)
  layers?.dispose()
  disposeAll(pages)
}

function unbindHeroAtlas(material: ShaderMaterial): void {
  material.uniforms.uHeroAtlas.value = null
  heroAtlasPresence.residentId = null
  heroAtlasPresence.pages = 0
  heroAtlasPresence.heroCells = NO_HERO_CELLS_BOUND
  heroAtlasPresence.firstHueTintedCell = null
}

function refuseHeroAtlas(pages: readonly Texture[], atlas: DrawnHeroAtlas): void {
  heroAtlasPresence.refusedId = atlas.id
  disposeAll(pages)
}

function disposeAll(textures: readonly Texture[]): void {
  for (const texture of textures) texture.dispose()
}
