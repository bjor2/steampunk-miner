/**
 * The terrain material's gate-marker tint (ticket 298, `terrainShader.ts`): the planet's act tint
 * (#151) the `cellGateLook` provider names, never a per-cell bit, so a tint change rebuilds no
 * chunk. The ONLY writer of the uniform; it is rewritten only when the planet changes, so a frame
 * allocates nothing.
 */
import { Vector3, type IUniform, type ShaderMaterial } from 'three'
import { GATE_MARKER_UNTINTED } from '../constants/scene'
import { cellGateLookProvider } from '../systems/registries/cellGateLook'
import { rgbOfHex, type Rgb } from '../systems/render/colour'
import type { PlanetParams } from '../systems/world/planetParams'

const UNTINTED: Rgb = rgbOfHex(GATE_MARKER_UNTINTED)

export function createGateTintUniforms(): Record<string, IUniform> {
  return { uGateTint: { value: new Vector3(...UNTINTED) } }
}

const TINTED_PLANETS = new WeakMap<ShaderMaterial, PlanetParams>()

export function fitGateTintToPlanet(material: ShaderMaterial, params: PlanetParams): void {
  if (TINTED_PLANETS.get(material) === params) return
  TINTED_PLANETS.set(material, params)
  const [red, green, blue] = markerTintOf(params)
  material.uniforms.uGateTint.value.set(red, green, blue)
}

function markerTintOf(params: PlanetParams): Rgb {
  return cellGateLookProvider()?.markerTintOf(params) ?? UNTINTED
}
