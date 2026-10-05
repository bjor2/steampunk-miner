/**
 * Drill sparks (#13 VFX): while the drill bites, sparks spray back from the tile at its nose,
 * denser and paler while it cuts lining (#41 casing feel).
 * One fixed pool drawn as points; stepping, emitting and uploading never allocate. Presentation
 * only, so the spray steps on the render delta with its own fixed seed.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { AdditiveBlending, BufferAttribute, BufferGeometry, PointsMaterial } from 'three'
import {
  CASING_SPARK_COLOUR,
  CASING_SPARKS_PER_SECOND,
  SCREEN_REFRESH_MS,
  SPARK_CAPACITY,
  SPARK_COLOUR,
  SPARK_LIFE_SECONDS,
  SPARK_SEED,
  SPARK_SIZE_PIXELS,
  SPARK_SPEED,
  SPARK_SPREAD_RADIANS,
  SPARKS_PER_SECOND,
} from '../constants/scene'
import { readDrillVoice } from '../store/screenReads'
import type { DrillVoice } from '../systems/audio/drillVoice'
import { writeHeadlampDirection } from '../systems/render/headlamp'
import {
  createParticlePool,
  particlesDue,
  sprayParticles,
  stepParticles,
  type EmissionCarry,
  type ParticlePool,
  type Spray,
} from '../systems/render/particles'
import { createSeededRandom, type SeededRandom } from '../systems/seededRandom'
import { drillPresence } from './drillPresence'

/** Sparks draw just in front of the tiles and the vehicle. */
const SPARK_Z = 0.3

// Module scratch: the drill's facing in world space, rewritten on every spray.
const drillDirection = { x: 0, y: 0 }

export function Sparks() {
  const pool = useMemo(() => createParticlePool(SPARK_CAPACITY), [])
  const random = useMemo(() => createSeededRandom(SPARK_SEED), [])
  const carry = useMemo<EmissionCarry>(() => ({ owed: 0 }), [])
  const spray = useMemo(createSprayScratch, [])
  const geometry = useMemo(createSparkGeometry, [])
  const material = useMemo(createSparkMaterial, [])

  const voice = useMemo<VoiceRead>(() => ({ voice: 'rock', sinceRead: VOICE_REFRESH_SECONDS }), [])

  useFrame((_, delta) => {
    stepParticles(pool, delta)
    refreshVoice(voice, material, delta)
    if (drillPresence.isDrilling)
      sprayFromNose(pool, random, spray, particlesDue(carry, sparkRateOf(voice.voice), delta))
    uploadPositions(pool, geometry)
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

/** The drill's voice is re-read as often as the HUD re-reads, not every frame. */
const VOICE_REFRESH_SECONDS = SCREEN_REFRESH_MS / 1000

interface VoiceRead {
  voice: DrillVoice
  sinceRead: number
}

function refreshVoice(read: VoiceRead, material: PointsMaterial, dt: number): void {
  read.sinceRead += dt
  if (read.sinceRead < VOICE_REFRESH_SECONDS) return
  read.sinceRead = 0
  read.voice = readDrillVoice()
  material.color.set(read.voice === 'casing' ? CASING_SPARK_COLOUR : SPARK_COLOUR)
}

function sparkRateOf(voice: DrillVoice): number {
  return voice === 'casing' ? CASING_SPARKS_PER_SECOND : SPARKS_PER_SECOND
}

function createSprayScratch(): Spray {
  return {
    x: 0,
    y: 0,
    dirX: 0,
    dirY: 1,
    speed: SPARK_SPEED,
    spreadRadians: SPARK_SPREAD_RADIANS,
    lifeSeconds: SPARK_LIFE_SECONDS,
  }
}

function createSparkGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(SPARK_CAPACITY * 3), 3))
  geometry.setDrawRange(0, 0)
  return geometry
}

function createSparkMaterial(): PointsMaterial {
  return new PointsMaterial({
    color: SPARK_COLOUR,
    size: SPARK_SIZE_PIXELS,
    sizeAttenuation: false,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
}

/** Sparks fly back out of the cut, away from the way the drill faces. */
function sprayFromNose(
  pool: ParticlePool,
  random: SeededRandom,
  spray: Spray,
  count: number,
): void {
  writeHeadlampDirection(drillPresence.up, drillPresence.facing, drillDirection)
  spray.x = drillPresence.nose.x
  spray.y = drillPresence.nose.y
  spray.dirX = -drillDirection.x
  spray.dirY = -drillDirection.y
  sprayParticles(pool, random, spray, count)
}

function uploadPositions(pool: ParticlePool, geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position') as BufferAttribute
  for (let at = 0; at < pool.count; at++) position.setXYZ(at, pool.x[at], pool.y[at], SPARK_Z)
  position.needsUpdate = true
  geometry.setDrawRange(0, pool.count)
}
