/**
 * The shockwave ring of a blast (D8, ticket 868): one quad whose shader draws a soft ring in the
 * type's ring colour, running out from the blast's centre across the ground radius over the plan's
 * seconds and fading as it goes. The quad is scaled to the ring's reach, so a planet-wide ring
 * costs one instance like a small one; stepped on the render delta, one draw call.
 */
import { ShaderMaterial } from 'three'
import { rgbOfHex, type Rgb } from '../../../systems/render/colour'
import type { MetrePoint } from '../../../systems/render/gunLook'
import type { BlastVfxPlan } from '../systems/render/blastVfxPlan'
import { createQuadPool, PLACE_VERTEX, showQuads, type QuadPool } from './instancedQuads'

interface RunningWave {
  seconds: number
  elapsed: number
  reachM: number
  widthM: number
  colour: Rgb
  opacity: number
  x: number
  y: number
  turn: number
}

export interface Shockwave {
  pool: QuadPool
  wave: RunningWave | null
  resources: { dispose(): void }[]
}

/** `aPlace` as the decal's (xy, width, turn); `aWave` the ring's radius and width as shares of the half width and its alpha. */
const WAVE_ATTRIBUTES = { aPlace: 4, aWave: 3, aColour: 3 } as const

export function createShockwave(z: number): Shockwave {
  const material = new ShaderMaterial({
    vertexShader: WAVE_VERTEX_SHADER,
    fragmentShader: WAVE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
  })
  const pool = createQuadPool(1, WAVE_ATTRIBUTES, material)
  pool.mesh.position.z = z
  return { pool, wave: null, resources: [pool.mesh.geometry, material] }
}

export function lightShockwave(
  shockwave: Shockwave,
  plan: BlastVfxPlan,
  centre: MetrePoint & { turn: number },
): void {
  const { seconds, reachM, widthM, colour, opacity } = plan.shockwave
  shockwave.wave = {
    seconds,
    elapsed: 0,
    reachM,
    widthM,
    colour: rgbOfHex(colour),
    opacity,
    x: centre.x,
    y: centre.y,
    turn: centre.turn,
  }
}

export function stepShockwave(shockwave: Shockwave, dt: number): void {
  const { wave } = shockwave
  if (wave === null) return
  wave.elapsed += dt
  if (wave.elapsed >= wave.seconds) shockwave.wave = null
}

/** Writes the ring at its reach this frame; whether it shows. */
export function drawShockwave(shockwave: Shockwave): boolean {
  const { wave, pool } = shockwave
  if (wave === null) {
    showQuads(pool, 0)
    return false
  }
  const run = wave.elapsed / wave.seconds
  const radiusM = wave.reachM * run
  const width = 2 * (wave.reachM + wave.widthM)
  const { aPlace, aWave, aColour } = pool.attributes
  aPlace.setXYZW(0, wave.x, wave.y, width, wave.turn)
  aWave.setXYZ(0, radiusM / width, wave.widthM / width, wave.opacity * (1 - run))
  aColour.setXYZ(0, wave.colour[0], wave.colour[1], wave.colour[2])
  showQuads(pool, 1)
  return true
}

const WAVE_VERTEX_SHADER = /* glsl */ `
${PLACE_VERTEX}
attribute vec3 aWave;
attribute vec3 aColour;
varying vec2 vOffset;
varying vec3 vWave;
varying vec3 vColour;
void main() {
  vOffset = position.xy * aPlace.z;
  vWave = aWave;
  vColour = aColour;
  gl_Position = placed(position.xy);
}
`

/** A soft band at the ring's radius, brighter on its leading edge, in the type's colour. */
const WAVE_FRAGMENT_SHADER = /* glsl */ `
varying vec2 vOffset;
varying vec3 vWave;
varying vec3 vColour;
void main() {
  float d = length(vOffset);
  float band = 1.0 - smoothstep(0.0, vWave.y, abs(d - vWave.x));
  float lead = step(vWave.x, d);
  float alpha = band * (0.55 + 0.45 * lead) * vWave.z;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(mix(vColour, vec3(1.0), 0.35 * lead), alpha);
}
`
