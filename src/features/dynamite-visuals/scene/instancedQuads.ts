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
 * the stroke, `aColour` the line and `aCasing` the plate tint with a flag in `w`.
 */
export const RING_ATTRIBUTES = { aPlace: 4, aRadii: 3, aColour: 3, aCasing: 4 } as const

export function createRingMaterial(dashes: number, opacity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uDashes: { value: dashes }, uOpacity: { value: opacity } },
    vertexShader: RING_VERTEX_SHADER,
    fragmentShader: RING_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  })
}

const PLACE_VERTEX = /* glsl */ `
attribute vec4 aPlace;
vec4 placed(vec2 corner) {
  float c = cos(aPlace.w);
  float s = sin(aPlace.w);
  vec2 turned = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * aPlace.z;
  return projectionMatrix * modelViewMatrix * vec4(aPlace.xy + turned, 0.0, 1.0);
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
varying vec3 vRadii;
varying vec3 vColour;
varying vec4 vCasing;
void main() {
  vOffset = position.xy * aPlace.z;
  vRadii = aRadii;
  vColour = aColour;
  vCasing = aCasing;
  gl_Position = placed(position.xy);
}
`

/**
 * The ground ring solid in the type's colour (plated in the casing tint, every other segment,
 * once casing will be laid); the danger ring inside it dashed and paler.
 */
const RING_FRAGMENT_SHADER = /* glsl */ `
uniform float uDashes;
uniform float uOpacity;
varying vec2 vOffset;
varying vec3 vRadii;
varying vec3 vColour;
varying vec4 vCasing;
void main() {
  float d = length(vOffset);
  float stroke = vRadii.z;
  float angle = atan(vOffset.y, vOffset.x) / 6.2831853 + 0.5;
  float segment = step(0.5, fract(angle * uDashes));
  float ground = 1.0 - smoothstep(stroke * 0.5, stroke * 0.5 + stroke * 0.25, abs(d - vRadii.y));
  float danger = (1.0 - smoothstep(stroke * 0.3, stroke * 0.3 + stroke * 0.2, abs(d - vRadii.x))) * segment;
  vec3 plated = mix(vColour, vCasing.rgb, vCasing.w * segment);
  vec3 pale = mix(vColour, vec3(1.0), 0.5);
  float alpha = max(ground, danger * 0.8) * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(mix(pale, plated, ground), alpha);
}
`
