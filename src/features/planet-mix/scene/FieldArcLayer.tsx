/**
 * A magnetic planet's field lines in the world (GD lock on spec #258 Q1 "On screen", GD ruling on
 * #293 Q1 option (a)): faint dashed blue arcs bending round and between the ferrous veins, one
 * `LineSegments` and one draw call of at most `FIELD_ARC_CAP` arcs, faint on every magnetic planet
 * (the galvanic probe brightens them in its own ticket). Its one vertex buffer is allocated once;
 * a frame re-picks the arcs only when the rig's look-ahead window reaches other chunks, and
 * otherwise only advances the dashes' clock, held still while reduce motion is on (the shake
 * switch, #33, #48). It never writes the authority, the camera or the sound.
 */
import { useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  ShaderMaterial,
  Vector4,
} from 'three'
import { MAX_SPEED_MM_PER_SECOND } from '../../../constants/balance'
import { MM_PER_METRE } from '../../../constants/physics'
import { useAtlasTextureSet } from '../../../scene/atlasTextures'
import { useDisposeEachOnRelease } from '../../../scene/disposeOnRelease'
import { SHIPPED_ART } from '../../../scene/shippedArt'
import { vehiclePresence } from '../../../scene/vehiclePresence'
import { readPlanetWorld, useGameStore } from '../../../store/gameStore'
import {
  createFieldArcBuffer,
  refreshFieldArcs,
  type FieldArcBuffer,
  type FieldArcPose,
} from '../systems/render/fieldArcBuffer'
import { fieldDashArtOf, type FieldDashArt } from '../systems/render/magneticArt'
import { MAGNETIC_LOOKS } from '../systems/render/magneticLooks'
import { showFieldArcBuffer } from './fieldArcPresence'

export const FIELD_ARC_LAYER_ID = 'planet-mix.field-lines'

/** Over the collapse cracks (0.27), under the sensing reveals (0.28), so the probe reads on top. */
const FIELD_ARC_Z = 0.275
const TOP_SPEED_M_PER_S = MAX_SPEED_MM_PER_SECOND / MM_PER_METRE
const LOOK = MAGNETIC_LOOKS.fieldLines
const DASH_ART = fieldDashArtOf(SHIPPED_ART)

const FIELD_ARC_VERTEX_SHADER = /* glsl */ `
attribute vec2 aDash;
varying vec2 vDash;
void main() {
  vDash = aDash;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

// Dashes running along each line, fading in from its start and out at its end; the dash art, once
// final, gives a dash its shape and the look its colour.
const FIELD_ARC_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColour;
uniform float uOpacity;
uniform float uTime;
uniform float uDashM;
uniform float uFlow;
uniform float uHasDash;
uniform sampler2D uDash;
uniform vec4 uDashUv;
varying vec2 vDash;

float dashAt(float alongM) {
  float u = fract((alongM - uTime * uFlow) / uDashM);
  if (uHasDash < 0.5) return step(u, 0.55);
  vec4 texel = texture2D(uDash, vec2(mix(uDashUv.x, uDashUv.z, u), mix(uDashUv.y, uDashUv.w, 0.5)));
  return texel.a * max(texel.r, max(texel.g, texel.b));
}

void main() {
  float ends = smoothstep(0.0, 0.15, vDash.y) * (1.0 - smoothstep(0.85, 1.0, vDash.y));
  float light = dashAt(vDash.x) * ends * uOpacity;
  gl_FragColor = vec4(uColour * light, light);
}
`

interface FieldArcPool {
  buffer: FieldArcBuffer
  geometry: BufferGeometry
  material: ShaderMaterial
  lines: LineSegments
  /** Where the rig was drawn last frame and how fast it moved since. */
  pose: FieldArcPose
}

export function FieldArcLayer() {
  const pool = useMemo(createFieldArcPool, [])
  useDisposeEachOnRelease(useMemo(() => [pool.geometry, pool.material], [pool]))
  useEffect(() => showFieldArcBuffer(pool.buffer), [pool])
  useFrame((_, delta) => drawFieldArcs(pool, delta))
  return (
    <>
      <primitive object={pool.lines} />
      {DASH_ART !== null && (
        <Suspense fallback={null}>
          <FieldDashMap pool={pool} dash={DASH_ART} />
        </Suspense>
      )}
    </>
  )
}

/** Hands the dash art to the pool's material once its map has loaded. */
function FieldDashMap({ pool, dash }: { pool: FieldArcPool; dash: FieldDashArt }) {
  const [map] = useAtlasTextureSet([dash.map])
  useEffect(() => {
    pool.material.uniforms.uDash.value = map
    pool.material.uniforms.uHasDash.value = 1
  }, [pool, map])
  return null
}

function createFieldArcPool(): FieldArcPool {
  const buffer = createFieldArcBuffer()
  const geometry = createFieldArcGeometry(buffer)
  const material = createFieldArcMaterial()
  const lines = new LineSegments(geometry, material)
  lines.position.z = FIELD_ARC_Z
  lines.frustumCulled = false
  lines.visible = false
  return { buffer, geometry, material, lines, pose: { ...vehiclePresence, vx: 0, vy: 0 } }
}

function createFieldArcGeometry(buffer: FieldArcBuffer): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(buffer.positions, 3))
  geometry.setAttribute('aDash', new BufferAttribute(buffer.dash, 2))
  geometry.setDrawRange(0, 0)
  return geometry
}

function createFieldArcMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: FIELD_ARC_VERTEX_SHADER,
    fragmentShader: FIELD_ARC_FRAGMENT_SHADER,
    uniforms: {
      uColour: { value: new Color(LOOK.colour).convertSRGBToLinear() },
      uOpacity: { value: LOOK.opacity },
      uTime: { value: 0 },
      uDashM: { value: LOOK.dashM },
      uFlow: { value: LOOK.flowMPerSecond },
      uHasDash: { value: 0 },
      uDash: { value: null },
      uDashUv: { value: new Vector4(...(DASH_ART?.uv ?? [0, 0, 1, 1])) },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

function drawFieldArcs(pool: FieldArcPool, delta: number): void {
  const { params } = readPlanetWorld()
  followRig(pool.pose, delta)
  if (params !== null && refreshFieldArcs(pool.buffer, params, pool.pose)) showPickedArcs(pool)
  advanceDashClock(pool.material, delta)
}

/** The rig's place now and its speed since last frame, never past the top speed (a teleport). */
function followRig(pose: FieldArcPose, delta: number): void {
  const seconds = Math.max(delta, Number.EPSILON)
  pose.vx = clampedSpeed((vehiclePresence.x - pose.x) / seconds)
  pose.vy = clampedSpeed((vehiclePresence.y - pose.y) / seconds)
  pose.x = vehiclePresence.x
  pose.y = vehiclePresence.y
}

function clampedSpeed(metresPerSecond: number): number {
  return Math.min(Math.max(metresPerSecond, -TOP_SPEED_M_PER_S), TOP_SPEED_M_PER_S)
}

function showPickedArcs(pool: FieldArcPool): void {
  const { buffer, geometry, lines } = pool
  geometry.setDrawRange(0, buffer.arcCount * buffer.segmentsPerArc * 2)
  geometry.getAttribute('position').needsUpdate = true
  geometry.getAttribute('aDash').needsUpdate = true
  lines.visible = buffer.arcCount > 0
}

function advanceDashClock(material: ShaderMaterial, delta: number): void {
  if (useGameStore.getState().prefs.shake) material.uniforms.uTime.value += delta
}
