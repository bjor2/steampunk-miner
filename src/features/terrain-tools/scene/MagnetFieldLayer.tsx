/**
 * The terrain magnets' fields in the world (GD lock on #246 build 5, the GD and TD rulings on
 * #286 Q1 option (a)): brass outlines for attract, repel and anchor in one `LineSegments`, one
 * draw call of at most `MAGNET_FIELD_CAP` pieces, kept apart from planet-mix's field lines (a
 * player tool's field, not the planet's; the galvanic probe brightens those, never these).
 *
 * It hears the gathers and waves as they are announced, and a frame writes its one buffer again
 * only when a field changed (`refreshMagnetFields`); otherwise only its clocks move: the authority
 * tick that drives each field's light and growth, and the sweep along the outlines, held still
 * while reduce motion is on (the shake switch, #33, #48). It never writes the authority, the
 * camera or the sound.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  ShaderMaterial,
} from 'three'
import { useDisposeEachOnRelease } from '../../../scene/disposeOnRelease'
import { vehiclePresence } from '../../../scene/vehiclePresence'
import { readAuthorityState } from '../../../store/authorityLink'
import { listenForDomainEvents } from '../../../store/domainEventBroadcast'
import { useGameStore } from '../../../store/gameStore'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import {
  createHeardMagnetFields,
  hearMagnetEvents,
  type HeardMagnetFields,
} from '../systems/render/heardMagnetFields'
import {
  createMagnetFieldBuffer,
  type MagnetFieldBuffer,
} from '../systems/render/magnetFieldBuffer'
import { MAGNET_FIELD_LOOK } from '../systems/render/magnetFieldLook'
import {
  createMagnetFieldWatch,
  refreshMagnetFields,
  type MagnetFieldWatch,
} from '../systems/render/magnetFieldRefresh'
import { showMagnetFieldPool } from './magnetFieldPresence'

export const MAGNET_FIELD_LAYER_ID = 'terrain-tools.magnet-fields'

/** Over planet-mix's field lines (0.275), under the sensing reveals (0.28). */
const MAGNET_FIELD_Z = 0.278
const LOOK = MAGNET_FIELD_LOOK

// `magnetFieldLight.ts` ported literally: the field opens from its centre over its growth ticks,
// ramps from faint to bright, and fades over its last ticks; ticks count from the buffer's epoch.
const MAGNET_FIELD_VERTEX_SHADER = /* glsl */ `
attribute vec3 aGrow;
attribute vec4 aTiming;
attribute vec2 aLevels;
uniform float uTick;
uniform float uRampTicks;
uniform float uFadeTicks;
varying float vLight;
varying float vShare;

float shareBetween(float tick, float fromTick, float ticks) {
  return clamp((tick - fromTick) / ticks, 0.0, 1.0);
}

void main() {
  float grow = aGrow.z > 0.0 ? shareBetween(uTick, aTiming.x, aGrow.z) : 1.0;
  vec3 placed = vec3(aGrow.xy + (position.xy - aGrow.xy) * grow, position.z);
  float bright = shareBetween(uTick, aTiming.y, uRampTicks);
  float fade = 1.0 - shareBetween(uTick, aTiming.z - uFadeTicks, uFadeTicks);
  vLight = uTick < aTiming.x ? 0.0 : mix(aLevels.x, aLevels.y, bright) * fade;
  vShare = aTiming.w;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(placed, 1.0);
}
`

// Brass, with an arc-blue sweep running along each outline (inward on the beacon's arcs).
const MAGNET_FIELD_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColour;
uniform vec3 uArcColour;
uniform float uSweep;
varying float vLight;
varying float vShare;

void main() {
  float sweep = smoothstep(0.7, 1.0, fract(vShare - uSweep));
  vec3 colour = mix(uColour, uArcColour, sweep);
  float light = vLight * (0.75 + 0.25 * sweep);
  gl_FragColor = vec4(colour * light, light);
}
`

interface MagnetFieldPool {
  buffer: MagnetFieldBuffer
  heard: HeardMagnetFields
  watch: MagnetFieldWatch
  geometry: BufferGeometry
  material: ShaderMaterial
  lines: LineSegments
}

export function MagnetFieldLayer() {
  const pool = useMemo(createMagnetFieldPool, [])
  useDisposeEachOnRelease(useMemo(() => [pool.geometry, pool.material], [pool]))
  useEffect(() => listenForDomainEvents((events) => hearFieldEvents(pool, events)), [pool])
  useEffect(() => showMagnetFieldPool(pool), [pool])
  useFrame((_, delta) => drawMagnetFields(pool, delta))
  return <primitive object={pool.lines} />
}

function createMagnetFieldPool(): MagnetFieldPool {
  const buffer = createMagnetFieldBuffer()
  const geometry = createMagnetFieldGeometry(buffer)
  const material = createMagnetFieldMaterial()
  const lines = new LineSegments(geometry, material)
  lines.position.z = MAGNET_FIELD_Z
  lines.frustumCulled = false
  lines.visible = false
  return {
    buffer,
    heard: createHeardMagnetFields(),
    watch: createMagnetFieldWatch(),
    geometry,
    material,
    lines,
  }
}

function createMagnetFieldGeometry(buffer: MagnetFieldBuffer): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(buffer.positions, 3))
  geometry.setAttribute('aGrow', new BufferAttribute(buffer.grow, 3))
  geometry.setAttribute('aTiming', new BufferAttribute(buffer.timing, 4))
  geometry.setAttribute('aLevels', new BufferAttribute(buffer.levels, 2))
  geometry.setDrawRange(0, 0)
  return geometry
}

function createMagnetFieldMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: MAGNET_FIELD_VERTEX_SHADER,
    fragmentShader: MAGNET_FIELD_FRAGMENT_SHADER,
    uniforms: {
      uColour: { value: new Color(LOOK.colour).convertSRGBToLinear() },
      uArcColour: { value: new Color(LOOK.arcColour).convertSRGBToLinear() },
      uTick: { value: 0 },
      uRampTicks: { value: LOOK.rampTicks },
      uFadeTicks: { value: LOOK.fadeTicks },
      uSweep: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

function hearFieldEvents(pool: MagnetFieldPool, events: readonly DomainEvent[]): void {
  hearMagnetEvents(pool.heard, events, readAuthorityState())
}

function drawMagnetFields(pool: MagnetFieldPool, delta: number): void {
  const state = readAuthorityState()
  const frame = { state, localPlayerId: useGameStore.getState().playerId, view: vehiclePresence }
  if (refreshMagnetFields(pool.buffer, pool.heard, pool.watch, frame)) showWrittenFields(pool)
  pool.material.uniforms.uTick.value = state.tick - pool.buffer.epochTick
  advanceSweep(pool.material, delta)
}

function showWrittenFields(pool: MagnetFieldPool): void {
  const { buffer, geometry, lines } = pool
  geometry.setDrawRange(0, buffer.pieceCount * buffer.segmentsPerPiece * 2)
  for (const name of ['position', 'aGrow', 'aTiming', 'aLevels']) {
    geometry.getAttribute(name).needsUpdate = true
  }
  lines.visible = buffer.pieceCount > 0
}

function advanceSweep(material: ShaderMaterial, delta: number): void {
  if (useGameStore.getState().prefs.shake)
    material.uniforms.uSweep.value += delta * LOOK.sweepPerSecond
}
