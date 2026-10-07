/**
 * The blast front's fixed pools (#215; looks from #153 and the #154 budget): fire and dust riding
 * the clearing's edge as two point pools, debris thrown out of the front as one instanced pool,
 * and the flash sprite over the clearing. Each pool is one draw call however full; emitting,
 * stepping and uploading never allocate. Presentation only, on the render delta with its own seed.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  PointsMaterial,
} from 'three'
import { MM_PER_METRE } from '../../../constants/physics'
import {
  COLLAPSE_DUST_CAPACITY,
  COLLAPSE_DUST_COLOUR,
  COLLAPSE_DUST_LIFE_SECONDS,
  COLLAPSE_DUST_SIZE_PIXELS,
  SPARK_CAPACITY,
  SPARK_COLOUR,
  SPARK_LIFE_SECONDS,
  SPARK_SIZE_PIXELS,
  SPARK_SPEED,
  COLLAPSE_DUST_FALL_SPEED,
} from '../../../constants/scene'
import { writeChargePlacement, type ChargePlacement } from '../../../systems/render/chargePlacement'
import {
  createParticlePool,
  sprayParticles,
  stepParticles,
  type ParticlePool,
  type Spray,
} from '../../../systems/render/particles'
import { createSeededRandom, type SeededRandom } from '../../../systems/seededRandom'
import type { QueuedFlash, QueuedFront } from '../systems/render/blastEventQueue'
import { flashSpriteOf, frontSprayOf } from '../systems/render/blastFrontLook'
import {
  BLAST_DEBRIS_CAPACITY,
  BLAST_FRONT_SEED,
  DEBRIS_COLOUR,
  DEBRIS_LIFE_SECONDS,
  DEBRIS_SIZE_M,
  DEBRIS_SPEED_MPS,
  DEBRIS_SPIN_RADIANS_PER_SECOND,
  DEBRIS_SPREAD_RADIANS,
  FLASH_SPRITE_COLOUR,
  RING_DUST_SPREAD_RADIANS,
  RING_FIRE_SPREAD_RADIANS,
} from '../systems/render/blastLookConstants'

/** Over the drill sparks (0.3): the front is the louder effect. */
const FIRE_Z = 0.31
const DUST_Z = 0.31
const DEBRIS_Z = 0.32
const FLASH_Z = 0.33
const FULL_TURN = Math.PI * 2

/** The four pools draw a call each; the capacities are what the layer declares (#213). */
export const BLAST_FRONT_BUDGET = {
  drawCalls: 4,
  instances: SPARK_CAPACITY + COLLAPSE_DUST_CAPACITY + BLAST_DEBRIS_CAPACITY + 1,
}

/** How one kind of piece leaves the front. */
interface RingThrow {
  pool: ParticlePool
  speed: number
  spreadRadians: number
  lifeSeconds: number
}

export interface BlastFrontPools {
  fire: RingThrow
  dust: RingThrow
  debris: RingThrow
  random: SeededRandom
  /** Scratch: one piece's spray, the blast's centre, one debris piece's matrix. */
  spray: Spray
  centre: ChargePlacement
  piece: Object3D
  fireGeometry: BufferGeometry
  dustGeometry: BufferGeometry
  fireMaterial: PointsMaterial
  dustMaterial: PointsMaterial
  debrisMesh: InstancedMesh
  flashMesh: Mesh<CircleGeometry, MeshBasicMaterial>
  flashFramesLeft: number
}

export function createBlastFrontPools(): BlastFrontPools {
  return {
    fire: ringThrowOf(SPARK_CAPACITY, SPARK_SPEED, RING_FIRE_SPREAD_RADIANS, SPARK_LIFE_SECONDS),
    dust: ringThrowOf(
      COLLAPSE_DUST_CAPACITY,
      COLLAPSE_DUST_FALL_SPEED,
      RING_DUST_SPREAD_RADIANS,
      COLLAPSE_DUST_LIFE_SECONDS,
    ),
    debris: ringThrowOf(
      BLAST_DEBRIS_CAPACITY,
      DEBRIS_SPEED_MPS,
      DEBRIS_SPREAD_RADIANS,
      DEBRIS_LIFE_SECONDS,
    ),
    random: createSeededRandom(BLAST_FRONT_SEED),
    spray: { x: 0, y: 0, dirX: 0, dirY: 1, speed: 0, spreadRadians: 0, lifeSeconds: 0 },
    centre: { x: 0, y: 0, turn: 0 },
    piece: new Object3D(),
    fireGeometry: createPointGeometry(SPARK_CAPACITY),
    dustGeometry: createPointGeometry(COLLAPSE_DUST_CAPACITY),
    fireMaterial: createFireMaterial(),
    dustMaterial: createDustMaterial(),
    debrisMesh: createDebrisMesh(),
    flashMesh: createFlashMesh(),
    flashFramesLeft: 0,
  }
}

/** What the pools hold on the GPU, for `useDisposeEachOnRelease`. */
export function gpuResourcesOf(pools: BlastFrontPools) {
  return [
    pools.fireGeometry,
    pools.dustGeometry,
    pools.fireMaterial,
    pools.dustMaterial,
    pools.debrisMesh.geometry,
    pools.debrisMesh.material as MeshBasicMaterial,
    pools.flashMesh.geometry,
    pools.flashMesh.material,
  ]
}

/** Throws a slice's fire, dust and debris across the ring it uncovered, outward. */
export function throwFront(pools: BlastFrontPools, front: QueuedFront): void {
  const counts = frontSprayOf(front.rInnerMm, front.rOuterMm)
  writeChargePlacement(front, pools.centre)
  throwAcrossRing(pools, pools.fire, front, counts.fire)
  throwAcrossRing(pools, pools.dust, front, counts.dust)
  throwAcrossRing(pools, pools.debris, front, counts.debris)
}

/** Lights the flash sprite over the clearing for its frames; a size with no flash shows none. */
export function lightFlash(pools: BlastFrontPools, flash: QueuedFlash): void {
  const sprite = flashSpriteOf(flash.size, flash.radiusMm)
  if (sprite.opacity === 0) return
  const centre = writeChargePlacement(flash, pools.centre)
  pools.flashMesh.position.set(centre.x, centre.y, FLASH_Z)
  pools.flashMesh.scale.set(sprite.radiusM, sprite.radiusM, 1)
  pools.flashMesh.material.opacity = sprite.opacity
  pools.flashFramesLeft = sprite.frames
}

export function stepBlastFrontPools(pools: BlastFrontPools, dt: number): void {
  stepParticles(pools.fire.pool, dt)
  stepParticles(pools.dust.pool, dt)
  stepParticles(pools.debris.pool, dt)
}

/** Uploads this frame's pieces and counts the flash down a frame. */
export function drawBlastFrontPools(pools: BlastFrontPools): void {
  uploadPoints(pools.fire.pool, pools.fireGeometry, FIRE_Z)
  uploadPoints(pools.dust.pool, pools.dustGeometry, DUST_Z)
  placeDebris(pools.debris.pool, pools.debrisMesh, pools.piece)
  pools.flashMesh.visible = pools.flashFramesLeft > 0
  pools.flashFramesLeft = Math.max(0, pools.flashFramesLeft - 1)
}

function ringThrowOf(
  capacity: number,
  speed: number,
  spreadRadians: number,
  lifeSeconds: number,
): RingThrow {
  return { pool: createParticlePool(capacity), speed, spreadRadians, lifeSeconds }
}

function throwAcrossRing(
  pools: BlastFrontPools,
  ring: RingThrow,
  front: QueuedFront,
  count: number,
): void {
  aimSprayAt(pools.spray, ring)
  for (let thrown = 0; thrown < count; thrown++) throwOnePiece(pools, ring.pool, front)
}

function aimSprayAt(spray: Spray, ring: RingThrow): void {
  spray.speed = ring.speed
  spray.spreadRadians = ring.spreadRadians
  spray.lifeSeconds = ring.lifeSeconds
}

/** One piece somewhere on the slice's ring, flying straight out from the blast's centre. */
function throwOnePiece(pools: BlastFrontPools, pool: ParticlePool, front: QueuedFront): void {
  const { random, spray, centre } = pools
  const angle = random.nextFloat() * FULL_TURN
  const reachMm = front.rInnerMm + random.nextFloat() * (front.rOuterMm - front.rInnerMm)
  spray.dirX = Math.cos(angle)
  spray.dirY = Math.sin(angle)
  spray.x = centre.x + (spray.dirX * reachMm) / MM_PER_METRE
  spray.y = centre.y + (spray.dirY * reachMm) / MM_PER_METRE
  sprayParticles(pool, random, spray, 1)
}

function uploadPoints(pool: ParticlePool, geometry: BufferGeometry, z: number): void {
  const position = geometry.getAttribute('position') as BufferAttribute
  for (let at = 0; at < pool.count; at++) position.setXYZ(at, pool.x[at], pool.y[at], z)
  position.needsUpdate = true
  geometry.setDrawRange(0, pool.count)
}

/** Each piece tumbles and shrinks away over its life. */
function placeDebris(pool: ParticlePool, mesh: InstancedMesh, piece: Object3D): void {
  for (let at = 0; at < pool.count; at++) {
    const left = 1 - pool.age[at] / pool.life[at]
    piece.position.set(pool.x[at], pool.y[at], DEBRIS_Z)
    piece.rotation.set(0, 0, at + pool.age[at] * DEBRIS_SPIN_RADIANS_PER_SECOND)
    piece.scale.set(DEBRIS_SIZE_M * left, DEBRIS_SIZE_M * left, 1)
    piece.updateMatrix()
    mesh.setMatrixAt(at, piece.matrix)
  }
  mesh.count = pool.count
  mesh.instanceMatrix.needsUpdate = true
}

function createPointGeometry(capacity: number): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(capacity * 3), 3))
  geometry.setDrawRange(0, 0)
  return geometry
}

/** Fire glows like the drill's sparks. */
function createFireMaterial(): PointsMaterial {
  return new PointsMaterial({
    color: SPARK_COLOUR,
    size: SPARK_SIZE_PIXELS,
    sizeAttenuation: false,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
}

/** Dust hangs dull like the collapse dust. */
function createDustMaterial(): PointsMaterial {
  return new PointsMaterial({
    color: COLLAPSE_DUST_COLOUR,
    size: COLLAPSE_DUST_SIZE_PIXELS,
    sizeAttenuation: false,
    transparent: true,
    depthWrite: false,
  })
}

function createDebrisMesh(): InstancedMesh {
  const material = new MeshBasicMaterial({ color: DEBRIS_COLOUR })
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, BLAST_DEBRIS_CAPACITY)
  mesh.count = 0
  mesh.frustumCulled = false
  return mesh
}

function createFlashMesh(): Mesh<CircleGeometry, MeshBasicMaterial> {
  const material = new MeshBasicMaterial({
    color: FLASH_SPRITE_COLOUR,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  })
  const mesh = new Mesh(new CircleGeometry(1, 48), material)
  mesh.visible = false
  mesh.frustumCulled = false
  return mesh
}
