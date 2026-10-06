/**
 * The terrain material's heat-tile uniforms (#113, #114, `terrainShader.ts`): the lava and
 * refractory lining maps once they load. The ONLY writer of those uniforms; until they load the
 * shader draws a flat molten colour and a procedural brick.
 */
import { RepeatWrapping, type IUniform, type ShaderMaterial, type Texture } from 'three'
import type { HeatTileMaps } from '../systems/art/tileLook'

export function createHeatTileUniforms(): Record<string, IUniform> {
  return {
    uHasHeatTiles: { value: 0 },
    uLavaAlbedo: { value: null },
    uLavaEmissive: { value: null },
    uRefractoryAlbedo: { value: null },
    uRefractoryEmissive: { value: null },
  }
}

/** The four maps in the order `bindHeatTiles` reads them. */
export function heatTileUrlsOf(maps: HeatTileMaps): string[] {
  return [maps.lava.albedo, maps.lavaEmissive, maps.refractory.albedo, maps.refractoryEmissive]
}

/** Textures in `heatTileUrlsOf` order; they repeat, since each covers one 4 m tile. */
export function bindHeatTiles(material: ShaderMaterial, textures: readonly Texture[]): void {
  textures.forEach(repeatTexture)
  const [lavaAlbedo, lavaEmissive, refractoryAlbedo, refractoryEmissive] = textures
  material.uniforms.uLavaAlbedo.value = lavaAlbedo
  material.uniforms.uLavaEmissive.value = lavaEmissive
  material.uniforms.uRefractoryAlbedo.value = refractoryAlbedo
  material.uniforms.uRefractoryEmissive.value = refractoryEmissive
  material.uniforms.uHasHeatTiles.value = 1
}

export function unbindHeatTiles(material: ShaderMaterial): void {
  material.uniforms.uHasHeatTiles.value = 0
}

function repeatTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.needsUpdate = true
}
