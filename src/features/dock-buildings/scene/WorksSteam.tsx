/**
 * The steam the Works' stacks vent at idle (ticket 395): one fixed particle pool for every vent,
 * each vent its own spray off `workshop.stack` with its own carry, so puffing and steady plumes hold
 * their rates at any frame rate. Drawn in the building's frame at the stack point's draw order
 * (behind the shell, so a stack's crown hides each puff's birth). Steps on the render delta:
 * presentation only, like the Refinery's smoke.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, PointsMaterial } from 'three'
import { useDisposeOnRelease } from '../../../scene/disposeOnRelease'
import {
  createParticlePool,
  particlesDue,
  sprayParticles,
  stepParticles,
  type EmissionCarry,
  type ParticlePool,
  type Spray,
} from '../../../systems/render/particles'
import { createSeededRandom, type SeededRandom } from '../../../systems/seededRandom'
import type { AttachPoint } from '../../../systems/art/partsSidecar'
import { WORKS_IDLE, type SteamLook, type SteamVent } from '../systems/render/worksIdle'
import { ventRateAt, ventSprayOf } from '../systems/render/worksSteam'
import { worksIdleNow } from './worksIdleNow'

/** As the building's parts step their draw order (AtlasQuadMesh). */
const Z_PER_DRAW_ORDER = 0.01

interface Vent {
  look: SteamVent
  spray: Spray
  carry: EmissionCarry
}

export function WorksSteam({ stack, baseZ }: { stack: AttachPoint; baseZ: number }) {
  const steam = WORKS_IDLE.steam
  const pool = useMemo(() => createParticlePool(steam.capacity), [steam])
  const random = useMemo(() => createSeededRandom(steam.seed), [steam])
  const vents = useMemo(() => ventsOf(steam, stack), [steam, stack])
  const geometry = useMemo(() => createSteamGeometry(steam.capacity), [steam])
  const material = useMemo(() => createSteamMaterial(steam), [steam])
  useDisposeOnRelease(geometry)
  useDisposeOnRelease(material)
  const z = baseZ + stack.z * Z_PER_DRAW_ORDER

  useFrame((_, delta) => {
    stepParticles(pool, delta)
    puffSteam(pool, random, vents, delta)
    uploadPositions(pool, geometry, z)
    worksIdleNow.steamParticles = pool.count
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

function ventsOf(steam: SteamLook, stack: AttachPoint): Vent[] {
  return steam.vents.map((look) => ({
    look,
    spray: ventSprayOf(look, stack.atM),
    carry: { owed: 0 },
  }))
}

function puffSteam(pool: ParticlePool, random: SeededRandom, vents: Vent[], dt: number): void {
  for (const vent of vents) {
    const due = particlesDue(vent.carry, ventRateAt(vent.look, worksIdleNow.seconds), dt)
    if (due > 0) sprayParticles(pool, random, vent.spray, due)
  }
}

function createSteamGeometry(capacity: number): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 3), 3))
  geometry.setDrawRange(0, 0)
  return geometry
}

function createSteamMaterial(steam: SteamLook): PointsMaterial {
  return new PointsMaterial({
    color: steam.colour,
    size: steam.sizePixels,
    sizeAttenuation: false,
    transparent: true,
    opacity: steam.opacity,
    depthWrite: false,
  })
}

function uploadPositions(pool: ParticlePool, geometry: BufferGeometry, z: number): void {
  const position = geometry.getAttribute('position') as BufferAttribute
  for (let at = 0; at < pool.count; at++) position.setXYZ(at, pool.x[at], pool.y[at], z)
  position.needsUpdate = true
  geometry.setDrawRange(0, pool.count)
}
