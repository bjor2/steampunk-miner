/**
 * The cement spray (#41 casing feel): as a casing ring is laid, a brief grey puff all round its
 * place behind the vehicle. Keyed to the `casingHiss` feedback cue, so it shows exactly when the
 * hiss plays. One fixed pool drawn as points, like the sparks; stepping, puffing and uploading
 * never allocate. Presentation only, on the render delta with its own fixed seed.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, PointsMaterial } from 'three'
import {
  CEMENT_CAPACITY,
  CEMENT_COLOUR,
  CEMENT_LIFE_SECONDS,
  CEMENT_PUFF_COUNT,
  CEMENT_SEED,
  CEMENT_SIZE_PIXELS,
  CEMENT_SPEED,
  CEMENT_SPRAY_BEHIND_M,
} from '../constants/scene'
import { listenForFeedback } from '../store/feedbackBroadcast'
import { writeHeadlampDirection } from '../systems/render/headlamp'
import {
  createParticlePool,
  sprayParticles,
  stepParticles,
  type ParticlePool,
  type Spray,
} from '../systems/render/particles'
import type { FeedbackCue } from '../systems/feedback/feedbackCues'
import { createSeededRandom, type SeededRandom } from '../systems/seededRandom'
import { drillPresence } from './drillPresence'
import { vehiclePresence } from './vehiclePresence'

/** The puff draws just behind the sparks, in front of the tiles and the vehicle. */
const CEMENT_Z = 0.28

// Module scratch: the drill's facing in world space, rewritten on every puff.
const drillDirection = { x: 0, y: 0 }

/** Puffs owed by cues since the last frame; cues arrive outside the frame loop. */
interface PuffQueue {
  owed: number
}

export function CementSpray() {
  const pool = useMemo(() => createParticlePool(CEMENT_CAPACITY), [])
  const random = useMemo(() => createSeededRandom(CEMENT_SEED), [])
  const spray = useMemo(createSprayScratch, [])
  const queue = useMemo<PuffQueue>(() => ({ owed: 0 }), [])
  const geometry = useMemo(createCementGeometry, [])
  const material = useMemo(createCementMaterial, [])
  useEffect(() => listenForFeedback((cue) => owePuffOn(queue, cue)), [queue])

  useFrame((_, delta) => {
    stepParticles(pool, delta)
    puffBehindVehicle(pool, random, spray, queue)
    uploadPositions(pool, geometry)
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

function owePuffOn(queue: PuffQueue, cue: FeedbackCue): void {
  if (cue.kind === 'casingHiss') queue.owed += 1
}

function createSprayScratch(): Spray {
  return {
    x: 0,
    y: 0,
    dirX: 0,
    dirY: 1,
    speed: CEMENT_SPEED,
    spreadRadians: Math.PI,
    lifeSeconds: CEMENT_LIFE_SECONDS,
  }
}

function createCementGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(CEMENT_CAPACITY * 3), 3))
  geometry.setDrawRange(0, 0)
  return geometry
}

function createCementMaterial(): PointsMaterial {
  return new PointsMaterial({
    color: CEMENT_COLOUR,
    size: CEMENT_SIZE_PIXELS,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  })
}

/** Each owed puff sprays all round the ring's place, behind the body along the drill's facing. */
function puffBehindVehicle(
  pool: ParticlePool,
  random: SeededRandom,
  spray: Spray,
  queue: PuffQueue,
): void {
  if (queue.owed === 0) return
  writeHeadlampDirection(drillPresence.up, drillPresence.facing, drillDirection)
  spray.x = vehiclePresence.x - drillDirection.x * CEMENT_SPRAY_BEHIND_M
  spray.y = vehiclePresence.y - drillDirection.y * CEMENT_SPRAY_BEHIND_M
  sprayParticles(pool, random, spray, queue.owed * CEMENT_PUFF_COUNT)
  queue.owed = 0
}

function uploadPositions(pool: ParticlePool, geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position') as BufferAttribute
  for (let at = 0; at < pool.count; at++) position.setXYZ(at, pool.x[at], pool.y[at], CEMENT_Z)
  position.needsUpdate = true
  geometry.setDrawRange(0, pool.count)
}
