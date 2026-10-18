/**
 * The terrain material's hero atlas (ticket 451; TD shape 6226270701 "#451 shape"): the ONLY
 * writer of `uHeroAtlas` and `heroAtlasPresence`. One atlas is resident at a time: the old one is
 * unbound and disposed before the next is bound, and the look table carries no atlas cell until
 * one is bound, so a hero never samples a released texture. An atlas the GPU would hold as RGBA8
 * is refused and disposed, and every hero keeps the shader look (no RGBA8 fallback, TD #470).
 */
import type { IUniform, ShaderMaterial, Texture } from 'three'
import type { HeroAtlasUnit } from '../systems/render/gpuTier'
import type { DrawnHeroAtlas } from '../systems/render/heroAtlas'
import { heroAtlasPresence, NO_HERO_ATLAS_CELLS } from './heroAtlasPresence'

export function createHeroAtlasUniforms(): Record<string, IUniform> {
  return { uHeroAtlas: { value: null } }
}

/** What the probe chose for the session's terrain material, for the debug reads. */
export function noteHeroAtlasUnit(unit: HeroAtlasUnit): void {
  heroAtlasPresence.unit = unit
}

export function bindHeroAtlas(
  material: ShaderMaterial,
  texture: Texture,
  atlas: DrawnHeroAtlas,
): void {
  if (!isCompressed(texture)) {
    refuseHeroAtlas(texture, atlas)
    return
  }
  material.uniforms.uHeroAtlas.value = texture
  heroAtlasPresence.residentId = atlas.id
  heroAtlasPresence.cells = atlas.cells
  heroAtlasPresence.binds++
}

/** Unbinds the atlas if it is the bound one, then frees its GPU copy. */
export function releaseHeroAtlas(material: ShaderMaterial, texture: Texture): void {
  if (material.uniforms.uHeroAtlas.value === texture) unbindHeroAtlas(material)
  texture.dispose()
}

function unbindHeroAtlas(material: ShaderMaterial): void {
  material.uniforms.uHeroAtlas.value = null
  heroAtlasPresence.residentId = null
  heroAtlasPresence.cells = NO_HERO_ATLAS_CELLS
}

function refuseHeroAtlas(texture: Texture, atlas: DrawnHeroAtlas): void {
  heroAtlasPresence.refusedId = atlas.id
  texture.dispose()
}

/** three's `CompressedTexture`; the loader decodes to a plain RGBA texture when it has no target. */
function isCompressed(texture: Texture): boolean {
  return (texture as Texture & { isCompressedTexture?: boolean }).isCompressedTexture === true
}
