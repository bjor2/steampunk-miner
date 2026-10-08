/**
 * The terrain material's render origin uniforms (ticket 339, `terrainShader.ts`): the origin itself
 * (`uWorldOffset`, the hi half of a fragment's split planet position, whose lo half is the chunk
 * mesh's render-local position), and the origin's own strata ring coordinates, wrapped to one tile
 * (`strataRingBaseOf`), which the shader adds its small origin-relative change to. The ONLY writer of
 * those uniforms. They are rewritten only when the origin or the planet changes, so most frames
 * do nothing, and a move rebuilds no chunk mesh.
 */
import { Vector2 as ThreeVector2, type IUniform, type ShaderMaterial } from 'three'
import { strataRingBaseOf, strataTurnsOf } from '../systems/render/groundStrata'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { BAND_COUNT } from '../systems/world/planetGeometry'
import type { PlanetParams } from '../systems/world/planetParams'

export function createTerrainOriginUniforms(): Record<string, IUniform> {
  return {
    uWorldOffset: { value: new ThreeVector2() },
    uStrataOriginU: { value: Array.from({ length: BAND_COUNT }, () => 0) },
    uStrataOriginV: { value: 0 },
  }
}

interface FittedOrigin {
  params: PlanetParams
  x: number
  y: number
}

const FITTED_ORIGINS = new WeakMap<ShaderMaterial, FittedOrigin>()

/** `origin` in planet metres: a chunk corner, so whole metres f32 holds exactly. */
export function fitTerrainToOrigin(
  material: ShaderMaterial,
  params: PlanetParams,
  origin: Vector2,
): void {
  const fitted = FITTED_ORIGINS.get(material)
  if (fitted !== undefined && isSameFit(fitted, params, origin)) return
  FITTED_ORIGINS.set(material, { params, x: origin.x, y: origin.y })
  writeOriginFit(material.uniforms, params, origin)
}

function isSameFit(fitted: FittedOrigin, params: PlanetParams, origin: Vector2): boolean {
  return fitted.params === params && fitted.x === origin.x && fitted.y === origin.y
}

function writeOriginFit(
  uniforms: ShaderMaterial['uniforms'],
  params: PlanetParams,
  origin: Vector2,
): void {
  uniforms.uWorldOffset.value.set(origin.x, origin.y)
  const base = strataRingBaseOf(origin.x, origin.y, strataTurnsOf(params))
  uniforms.uStrataOriginU.value = base.u
  uniforms.uStrataOriginV.value = base.v
}
