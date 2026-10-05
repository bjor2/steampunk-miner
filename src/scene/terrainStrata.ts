/**
 * The terrain material's ground strata uniforms (S7d, `terrainShader.ts`): the five bands' maps
 * once they load, and how they lie on the current planet (`groundStrata.ts`). The ONLY writer of
 * those uniforms. The fit is rewritten only when the planet changes, so a frame allocates nothing.
 */
import { RepeatWrapping, Vector3, type IUniform, type ShaderMaterial, type Texture } from 'three'
import type { TileMaps } from '../systems/art/tileLook'
import { STRATA_TILE_M, strataTintsOf, strataTurnsOf } from '../systems/render/groundStrata'
import { BAND_COUNT } from '../systems/world/planetGeometry'
import type { PlanetParams } from '../systems/world/planetParams'
import { renderPresence } from './renderPresence'

/** The strata uniforms with no maps yet: the shader draws flat band colours. */
export function createStrataUniforms(): Record<string, IUniform> {
  return {
    uHasStrata: { value: 0 },
    uStrataAlbedo: { value: Array.from({ length: BAND_COUNT }, () => null) },
    uStrataNormal: { value: Array.from({ length: BAND_COUNT }, () => null) },
    uStrataTint: { value: Array.from({ length: BAND_COUNT }, () => new Vector3(1, 1, 1)) },
    uStrataTurns: { value: Array.from({ length: BAND_COUNT }, () => 1) },
    uStrataTileM: { value: STRATA_TILE_M },
    uBandStarts: { value: Array.from({ length: BAND_COUNT - 1 }, () => 0) },
  }
}

/** Every albedo map in band order, then every normal map: the order `bindStrataMaps` reads. */
export function strataMapUrlsOf(strata: readonly TileMaps[]): string[] {
  return [...strata.map((maps) => maps.albedo), ...strata.map((maps) => maps.normal)]
}

/** Textures in `strataMapUrlsOf` order; they repeat, since each covers one 4 m tile. */
export function bindStrataMaps(material: ShaderMaterial, textures: readonly Texture[]): void {
  textures.forEach(repeatTexture)
  material.uniforms.uStrataAlbedo.value = textures.slice(0, BAND_COUNT)
  material.uniforms.uStrataNormal.value = textures.slice(BAND_COUNT)
  material.uniforms.uHasStrata.value = 1
  renderPresence.strataBands = BAND_COUNT
}

export function unbindStrataMaps(material: ShaderMaterial): void {
  material.uniforms.uHasStrata.value = 0
  renderPresence.strataBands = 0
}

const FITTED_PLANETS = new WeakMap<ShaderMaterial, PlanetParams>()

export function fitStrataToPlanet(material: ShaderMaterial, params: PlanetParams): void {
  if (FITTED_PLANETS.get(material) === params) return
  FITTED_PLANETS.set(material, params)
  writeStrataFit(material.uniforms, params)
}

function writeStrataFit(uniforms: ShaderMaterial['uniforms'], params: PlanetParams): void {
  uniforms.uStrataTurns.value = strataTurnsOf(params)
  uniforms.uBandStarts.value = [...params.bandStartsHalfTileSq]
  const tints: Vector3[] = uniforms.uStrataTint.value
  strataTintsOf(params.paletteId).forEach(([red, green, blue], at) =>
    tints[at].set(red, green, blue),
  )
}

function repeatTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.needsUpdate = true
}
