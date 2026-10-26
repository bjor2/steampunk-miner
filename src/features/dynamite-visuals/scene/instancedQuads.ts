/**
 * Pooled quads for the blast marks (D7, ticket 866): one draw call each however many show. A quad
 * pool is a unit plane instanced with its own per-instance attributes, written in place each frame.
 * The decal pool cuts each quad from the crater atlas and tints it; the ring pool draws a live
 * charge's two rings in its fragment shader, so a 37-tile ring costs one quad. GPU-side only.
 */
import {
  BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  type Texture,
} from 'three'

export interface QuadPool {
  mesh: Mesh<InstancedBufferGeometry, ShaderMaterial>
  attributes: Record<string, InstancedBufferAttribute>
}

const UNIT_PLANE = new PlaneGeometry(1, 1)

/** A pool of `capacity` quads with the named per-instance float attributes, drawing none. */
export function createQuadPool(
  capacity: number,
  attributeSizes: Readonly<Record<string, number>>,
  material: ShaderMaterial,
): QuadPool {
  const geometry = new InstancedBufferGeometry()
  geometry.setIndex(UNIT_PLANE.getIndex())
  geometry.setAttribute('position', UNIT_PLANE.getAttribute('position') as BufferAttribute)
  geometry.setAttribute('uv', UNIT_PLANE.getAttribute('uv') as BufferAttribute)
  const attributes: Record<string, InstancedBufferAttribute> = {}
  for (const [name, size] of Object.entries(attributeSizes)) {
    attributes[name] = new InstancedBufferAttribute(new Float32Array(capacity * size), size)
    attributes[name].setUsage(35048) // DynamicDrawUsage
    geometry.setAttribute(name, attributes[name])
  }
  geometry.instanceCount = 0
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  return { mesh, attributes }
}

/** Shows the first `count` quads and uploads every attribute. */
export function showQuads(pool: QuadPool, count: number): void {
  pool.mesh.geometry.instanceCount = count
  pool.mesh.visible = count > 0
  for (const attribute of Object.values(pool.attributes)) attribute.needsUpdate = true
}

export function disposeQuadPool(pool: QuadPool): void {
  pool.mesh.geometry.dispose()
  pool.mesh.material.dispose()
}

/** A decal: a tinted, turned rectangle of the atlas at `aPlace.xy`, `aPlace.z` wide, turned `aPlace.w`. */
export const DECAL_ATTRIBUTES = { aPlace: 4, aUv: 4, aTint: 3 } as const

export function createDecalMaterial(map: Texture, gain: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uMap: { value: map }, uGain: { value: gain } },
    vertexShader: DECAL_VERTEX_SHADER,
    fragmentShader: DECAL_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  })
}

/**
 * A ring quad: `aPlace` as the decal's (xy, width, turn), `aRadii` the base and ground radii and
 * the stroke in metres, `aColour` the line and `aCasing` the plate tint with a flag in `w`.
 */
export const RING_ATTRIBUTES = { aPlace: 4, aRadii: 3, aColour: 3, aCasing: 4 } as const

/**
 * The ring material: the ground ring dashed every `dashMetres` of its rim, and clipped where it
 * leaves the planet once `uPlanetRadiusM` is set (0 clips nothing).
 */
export function createRingMaterial(dashMetres: number, opacity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uDashM: { value: dashMetres },
      uOpacity: { value: opacity },
      uPlanetRadiusM: { value: 0 },
    },
    vertexShader: RING_VERTEX_SHADER,
    fragmentShader: RING_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  })
}

/**
 * The placing every quad shader shares: `aPlace` as (xy, width, turn), `placedPoint` the corner on
 * the planet in metres; the blast shockwave reuses it.
 */
export const PLACE_VERTEX = /* glsl */ `
attribute vec4 aPlace;
vec2 placedPoint(vec2 corner) {
  float c = cos(aPlace.w);
  float s = sin(aPlace.w);
  return aPlace.xy + vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * aPlace.z;
}
vec4 placed(vec2 corner) {
  return projectionMatrix * modelViewMatrix * vec4(placedPoint(corner), 0.0, 1.0);
}
`

const DECAL_VERTEX_SHADER = /* glsl */ `
${PLACE_VERTEX}
attribute vec4 aUv;
attribute vec3 aTint;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vUv = vec2(mix(aUv.x, aUv.z, uv.x), mix(aUv.y, aUv.w, uv.y));
  vTint = aTint;
  gl_Position = placed(position.xy);
}
`

/** The atlas alpha is the part mask (#52): cut, never blended, so the ground shows through. */
const DECAL_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMap;
uniform float uGain;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vec4 texel = texture2D(uMap, vUv);
  if (texel.a < 0.5) discard;
  gl_FragColor = vec4(min(vec3(1.0), texel.rgb * vTint * uGain), 1.0);
}
`

const RING_VERTEX_SHADER = /* glsl */ `
${PLACE_VERTEX}
attribute vec3 aRadii;
attribute vec3 aColour;
attribute vec4 aCasing;
varying vec2 vOffset;
varying vec2 vPlanet;
varying vec3 vRadii;
varying vec3 vColour;
varying vec4 vCasing;
void main() {
  vOffset = position.xy * aPlace.z;
  vPlanet = placedPoint(position.xy);
  vRadii = aRadii;
  vColour = aColour;
  vCasing = aCasing;
  gl_Position = placed(position.xy);
}
`

/**
 * The G&V row on #869: the danger ring solid and paler at the base radius, which no level grows;
 * the ground ring dashed in the type's colour (every other dash plated in the casing tint once
 * casing will be laid) at what the blast will clear, cut off where it leaves the planet. Every
 * length is in metres, so a dash keeps its length on a ring of any size.
 */
const RING_FRAGMENT_SHADER = /* glsl */ `
uniform float uDashM;
uniform float uOpacity;
uniform float uPlanetRadiusM;
varying vec2 vOffset;
varying vec2 vPlanet;
varying vec3 vRadii;
varying vec3 vColour;
varying vec4 vCasing;
void main() {
  float d = length(vOffset);
  float stroke = vRadii.z;
  float turn = atan(vOffset.y, vOffset.x) / 6.2831853 + 0.5;
  float dashes = max(1.0, floor(6.2831853 * vRadii.y / uDashM));
  float dash = step(0.5, fract(turn * dashes));
  float plate = step(0.5, fract(turn * dashes * 0.5));
  float onPlanet = uPlanetRadiusM > 0.0 ? step(length(vPlanet), uPlanetRadiusM) : 1.0;
  float ground = (1.0 - smoothstep(stroke * 0.5, stroke * 0.75, abs(d - vRadii.y))) * dash * onPlanet;
  float danger = 1.0 - smoothstep(stroke * 0.3, stroke * 0.5, abs(d - vRadii.x));
  vec3 plated = mix(vColour, vCasing.rgb, vCasing.w * plate);
  vec3 pale = mix(vColour, vec3(1.0), 0.5);
  float alpha = max(ground, danger * 0.8) * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(mix(pale, plated, ground), alpha);
}
`
