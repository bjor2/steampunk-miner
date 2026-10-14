/**
 * The blast front's fixed pools (#215; looks from #153 and the #154 budget): fire and dust riding
 * the clearing's edge as two point pools, and the flash sprite over the clearing. The debris thrown
 * out of the front goes to the kernel's spray layer at high priority (ticket 348), which took this
 * slice's debris pool at the same count. Each pool is one draw call however full; emitting,
 * stepping and uploading never allocate. Presentation only, on the render delta with its own seed.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Mesh,
  MeshBasicMaterial,
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
import { requestSpray, type SprayRequest } from '../../../store/sprayRequests'
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
import { blastFrontPresence } from './blastFrontPresence'
import {
  flashSpriteOf,
  frontLayerDrawOf,
  frontSprayOf,
  raisePeak,
  type FrontPoolCounts,
} from '../systems/render/blastFrontLook'
import {
  BLAST_FRONT_SEED,
  FLASH_SPRITE_COLOUR,
  RING_DUST_SPREAD_RADIANS,
  RING_FIRE_SPREAD_RADIANS,
} from '../systems/render/blastLookConstants'

/** Over the drill sparks (0.3): the front is the louder effect. */
const FIRE_Z = 0.31
const DUST_Z = 0.31
const FLASH_Z = 0.33
const FULL_TURN = Math.PI * 2

/**
 * The three pools draw a call each; the capacities are what the layer declares (#213). The debris
 * pool's call and 96 instances moved to the kernel's `SPRAY_LAYER_BUDGET` (ticket 348).
 */
export const BLAST_FRONT_BUDGET = {
  drawCalls: 3,
  instances: SPARK_CAPACITY + COLLAPSE_DUST_CAPACITY + 1,
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
  random: SeededRandom
  /** Scratch: one piece's spray, the blast's centre, one debris piece's request to the kernel. */
  spray: Spray
  centre: ChargePlacement
  debris: SprayRequest
  counts: FrontPoolCounts
  fireGeometry: BufferGeometry
  dustGeometry: BufferGeometry
  fireMaterial: PointsMaterial
  dustMaterial: PointsMaterial
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
    random: createSeededRandom(BLAST_FRONT_SEED),
    spray: { x: 0, y: 0, dirX: 0, dirY: 1, speed: 0, spreadRadians: 0, lifeSeconds: 0 },
    centre: { x: 0, y: 0, turn: 0 },
    debris: { kind: 'debris', x: 0, y: 0, dirX: 0, dirY: 1, count: 1, priority: 'high' },
    counts: { fire: 0, dust: 0, isFlashShown: false },
    fireGeometry: createPointGeometry(SPARK_CAPACITY),
    dustGeometry: createPointGeometry(COLLAPSE_DUST_CAPACITY),
    fireMaterial: createFireMaterial(),
    dustMaterial: createDustMaterial(),
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
  throwDebrisAcrossRing(pools, front, counts.debris)
  blastFrontPresence.frontsThrown++
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
  blastFrontPresence.flashesLit++
}

export function stepBlastFrontPools(pools: BlastFrontPools, dt: number): void {
  stepParticles(pools.fire.pool, dt)
  stepParticles(pools.dust.pool, dt)
}

/** Uploads this frame's pieces, counts the flash down a frame and records what it drew. */
export function drawBlastFrontPools(pools: BlastFrontPools): void {
  uploadPoints(pools.fire.pool, pools.fireGeometry, FIRE_Z)
  uploadPoints(pools.dust.pool, pools.dustGeometry, DUST_Z)
  pools.flashMesh.visible = pools.flashFramesLeft > 0
  pools.flashFramesLeft = Math.max(0, pools.flashFramesLeft - 1)
  recordFrameDraw(pools)
}

function recordFrameDraw(pools: BlastFrontPools): void {
  const { counts } = pools
  counts.fire = pools.fire.pool.count
  counts.dust = pools.dust.pool.count
  counts.isFlashShown = pools.flashMesh.visible
  raisePeak(blastFrontPresence.peak, frontLayerDrawOf(counts))
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
  pickRingPoint(pools, front)
  sprayParticles(pool, pools.random, pools.spray, 1)
}

/** Debris goes to the kernel spray at high priority: a held gun's tracer never takes its room. */
function throwDebrisAcrossRing(pools: BlastFrontPools, front: QueuedFront, count: number): void {
  for (let thrown = 0; thrown < count; thrown++) throwOneDebrisPiece(pools, front)
}

function throwOneDebrisPiece(pools: BlastFrontPools, front: QueuedFront): void {
  const { spray, debris } = pools
  pickRingPoint(pools, front)
  debris.x = spray.x
  debris.y = spray.y
  debris.dirX = spray.dirX
  debris.dirY = spray.dirY
  requestSpray(debris)
}

/** Aims the spray scratch at a random point on the slice's ring, pointing out from the centre. */
function pickRingPoint(pools: BlastFrontPools, front: QueuedFront): void {
  const { random, spray, centre } = pools
  const angle = random.nextFloat() * FULL_TURN
  const reachMm = front.rInnerMm + random.nextFloat() * (front.rOuterMm - front.rInnerMm)
  spray.dirX = Math.cos(angle)
  spray.dirY = Math.sin(angle)
  spray.x = centre.x + (spray.dirX * reachMm) / MM_PER_METRE
  spray.y = centre.y + (spray.dirY * reachMm) / MM_PER_METRE
}

function uploadPoints(pool: ParticlePool, geometry: BufferGeometry, z: number): void {
  const position = geometry.getAttribute('position') as BufferAttribute
  for (let at = 0; at < pool.count; at++) position.setXYZ(at, pool.x[at], pool.y[at], z)
  position.needsUpdate = true
  geometry.setDrawRange(0, pool.count)
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
