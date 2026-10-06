/**
 * The Refinery bay on the platform (#105, #106 art, #81 acceptance 3): from the planet the
 * platform has it, the baked bay stands on its pad with the look the authority's slots give it,
 * and while a batch refines, smoke rises from its stack (procedural, #51). Drawn in the platform's
 * group, so its offset is from the hub; the look changes only when the replica's does, so the parts
 * render through React, and only the smoke runs per frame, from one fixed pool.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry, PointsMaterial } from 'three'
import {
  REFINERY_SMOKE_CAPACITY,
  REFINERY_SMOKE_COLOUR,
  REFINERY_SMOKE_LIFE_SECONDS,
  REFINERY_SMOKE_PER_SECOND,
  REFINERY_SMOKE_SEED,
  REFINERY_SMOKE_SIZE_PIXELS,
  REFINERY_SMOKE_SPEED,
  REFINERY_SMOKE_SPREAD_RADIANS,
  REFINERY_STACK_TOP_M,
} from '../constants/scene'
import {
  createParticlePool,
  particlesDue,
  sprayParticles,
  stepParticles,
  type EmissionCarry,
  type ParticlePool,
  type Spray,
} from '../systems/render/particles'
import {
  refineryBayMaps,
  refineryBayOffsetOf,
  refineryBayQuadsOf,
  type RefineryBayLook,
} from '../systems/render/refineryBayLook'
import { createSeededRandom, type SeededRandom } from '../systems/seededRandom'
import type { DockSite } from '../systems/world/dockSite'
import { PartQuadMesh } from './PartQuadMesh'
import { SHIPPED_ART } from './shippedArt'

/** Behind the platform's placeholder shapes, which sit at 0.02; the smoke in front of the bay. */
const BAY_Z = 0.015
const SMOKE_Z = 0.04
const maps = refineryBayMaps(SHIPPED_ART)

export function RefineryBay({ site, look }: { site: DockSite; look: RefineryBayLook }) {
  const quads = useMemo(() => refineryBayQuadsOf(SHIPPED_ART, look), [look])
  return (
    <group position={[refineryBayOffsetOf(site), 0, 0]}>
      {quads.map((quad) => (
        <PartQuadMesh key={quad.partId} quad={quad} maps={maps} baseZ={BAY_Z} />
      ))}
      <StackSmoke isRising={look === 'refining'} />
    </group>
  )
}

function StackSmoke({ isRising }: { isRising: boolean }) {
  const pool = useMemo(() => createParticlePool(REFINERY_SMOKE_CAPACITY), [])
  const random = useMemo(() => createSeededRandom(REFINERY_SMOKE_SEED), [])
  const spray = useMemo(createSmokeSpray, [])
  const carry = useMemo<EmissionCarry>(() => ({ owed: 0 }), [])
  const geometry = useMemo(createSmokeGeometry, [])
  const material = useMemo(createSmokeMaterial, [])

  useFrame((_, delta) => {
    stepParticles(pool, delta)
    if (isRising)
      puffSmoke(pool, random, spray, particlesDue(carry, REFINERY_SMOKE_PER_SECOND, delta))
    uploadPositions(pool, geometry)
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

function createSmokeSpray(): Spray {
  return {
    x: REFINERY_STACK_TOP_M[0],
    y: REFINERY_STACK_TOP_M[1],
    dirX: 0,
    dirY: 1,
    speed: REFINERY_SMOKE_SPEED,
    spreadRadians: REFINERY_SMOKE_SPREAD_RADIANS,
    lifeSeconds: REFINERY_SMOKE_LIFE_SECONDS,
  }
}

function puffSmoke(pool: ParticlePool, random: SeededRandom, spray: Spray, due: number): void {
  if (due > 0) sprayParticles(pool, random, spray, due)
}

function createSmokeGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  const positions = new Float32Array(REFINERY_SMOKE_CAPACITY * 3)
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setDrawRange(0, 0)
  return geometry
}

function createSmokeMaterial(): PointsMaterial {
  return new PointsMaterial({
    color: REFINERY_SMOKE_COLOUR,
    size: REFINERY_SMOKE_SIZE_PIXELS,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  })
}

function uploadPositions(pool: ParticlePool, geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position') as BufferAttribute
  for (let at = 0; at < pool.count; at++) position.setXYZ(at, pool.x[at], pool.y[at], SMOKE_Z)
  position.needsUpdate = true
  geometry.setDrawRange(0, pool.count)
}
