/**
 * The blast front's fixed pools (#215; looks from #153 and the #154 budget; the explosion pass of
 * D8, ticket 868): fire and dust riding the clearing's edge as two coloured point pools that also
 * carry the stages' fireball sparks, embers, plume, smoke and chips; the flash-and-fireball disc
 * over the clearing; and the shockwave ring. The debris thrown out of the front goes to the
 * kernel's spray layer at high priority (ticket 348). Each pool is one draw call however full;
 * emitting, stepping and uploading never allocate. Presentation only, on the render delta: a blast
 * draws from its own seeded random (`blastSeededRandoms.ts`), a front from its blast's.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import {
  COLLAPSE_DUST_COLOUR,
  COLLAPSE_DUST_FALL_SPEED,
  COLLAPSE_DUST_LIFE_SECONDS,
  COLLAPSE_DUST_SIZE_PIXELS,
  SPARK_CAPACITY,
  SPARK_COLOUR,
  SPARK_LIFE_SECONDS,
  SPARK_SIZE_PIXELS,
  SPARK_SPEED,
} from '../../../constants/scene'
import { requestSpray, type SprayRequest } from '../../../store/sprayRequests'
import { writeChargePlacement, type ChargePlacement } from '../../../systems/render/chargePlacement'
import { rgbOfHex, type Rgb } from '../../../systems/render/colour'
import type { Spray } from '../../../systems/render/particles'
import type { SeededRandom } from '../../../systems/seededRandom'
import type { QueuedFront } from '../systems/render/blastEventQueue'
import {
  frontLayerDrawOf,
  frontSprayOf,
  raisePeak,
  type FrontPoolCounts,
} from '../systems/render/blastFrontLook'
import {
  BLAST_FRONT_SEED,
  FRONT_DUST_CAPACITY,
  RING_DUST_SPREAD_RADIANS,
  RING_FIRE_SPREAD_RADIANS,
  SEEDED_BLAST_SLOTS,
} from '../systems/render/blastLookConstants'
import {
  createBlastRandoms,
  randomOfBlastAt,
  type BlastRandoms,
} from '../systems/render/blastSeededRandoms'
import { blastFrontPresence } from './blastFrontPresence'
import { createFlashball, drawFlashball, stepFlashball, type Flashball } from './blastFlashball'
import { createShockwave, drawShockwave, stepShockwave, type Shockwave } from './blastShockwave'
import {
  createColouredPointPool,
  sprayColoured,
  stepColoured,
  uploadColoured,
  type ColouredPointPool,
} from './colouredPointPool'

/** Over the drill sparks (0.3): the front is the louder effect. */
export const FIRE_Z = 0.31
export const DUST_Z = 0.31
/** The shockwave rides between the dust and the flash. */
export const SHOCKWAVE_Z = 0.32
export const FLASH_Z = 0.33
const FULL_TURN = Math.PI * 2

/**
 * The pools draw a call each: the fire and dust points, the flash-and-fireball disc and the
 * shockwave ring (#213). The debris pool's call and 96 instances moved to the kernel's
 * `SPRAY_LAYER_BUDGET` (ticket 348).
 */
export const BLAST_FRONT_BUDGET = {
  drawCalls: 4,
  instances: SPARK_CAPACITY + FRONT_DUST_CAPACITY + 2,
}

/** How one kind of piece leaves the front. */
export interface RingThrow {
  pool: ColouredPointPool
  speed: number
  spreadRadians: number
  lifeSeconds: number
  colour: Rgb
}

export interface BlastFrontPools {
  fire: RingThrow
  dust: RingThrow
  flashball: Flashball
  shockwave: Shockwave
  randoms: BlastRandoms
  /** Scratch: one piece's spray, the blast's centre, one debris piece's request to the kernel. */
  spray: Spray
  centre: ChargePlacement
  debris: SprayRequest
  counts: FrontPoolCounts
}

export function createBlastFrontPools(): BlastFrontPools {
  return {
    fire: ringThrowOf(
      createColouredPointPool(SPARK_CAPACITY, SPARK_SIZE_PIXELS, true),
      SPARK_SPEED,
      RING_FIRE_SPREAD_RADIANS,
      SPARK_LIFE_SECONDS,
      SPARK_COLOUR,
    ),
    dust: ringThrowOf(
      createColouredPointPool(FRONT_DUST_CAPACITY, COLLAPSE_DUST_SIZE_PIXELS, false),
      COLLAPSE_DUST_FALL_SPEED,
      RING_DUST_SPREAD_RADIANS,
      COLLAPSE_DUST_LIFE_SECONDS,
      COLLAPSE_DUST_COLOUR,
    ),
    flashball: createFlashball(),
    shockwave: createShockwave(SHOCKWAVE_Z),
    randoms: createBlastRandoms(SEEDED_BLAST_SLOTS, BLAST_FRONT_SEED),
    spray: { x: 0, y: 0, dirX: 0, dirY: 1, speed: 0, spreadRadians: 0, lifeSeconds: 0 },
    centre: { x: 0, y: 0, turn: 0 },
    debris: { kind: 'debris', x: 0, y: 0, dirX: 0, dirY: 1, count: 1, priority: 'high' },
    counts: { fire: 0, dust: 0, isFlashShown: false, isShockwaveShown: false },
  }
}

/** What the pools hold on the GPU, for `useDisposeEachOnRelease`. */
export function gpuResourcesOf(pools: BlastFrontPools) {
  return [
    pools.fire.pool.geometry,
    pools.dust.pool.geometry,
    pools.fire.pool.material,
    pools.dust.pool.material,
    pools.flashball.mesh.geometry,
    pools.flashball.mesh.material,
    ...pools.shockwave.resources,
  ]
}

/** Throws a slice's fire, dust and debris across the ring it uncovered, outward. */
export function throwFront(pools: BlastFrontPools, front: QueuedFront): void {
  const counts = frontSprayOf(front.rInnerMm, front.rOuterMm)
  const random = randomOfBlastAt(pools.randoms, front.tx, front.ty)
  writeChargePlacement(front, pools.centre)
  throwAcrossRing(pools, pools.fire, front, counts.fire, random)
  throwAcrossRing(pools, pools.dust, front, counts.dust, random)
  throwDebrisAcrossRing(pools, front, counts.debris, random)
  blastFrontPresence.frontsThrown++
}

export function stepBlastFrontPools(pools: BlastFrontPools, dt: number): void {
  stepColoured(pools.fire.pool, dt)
  stepColoured(pools.dust.pool, dt)
  stepFlashball(pools.flashball, dt)
  stepShockwave(pools.shockwave, dt)
}

/** Uploads this frame's pieces, draws the disc and the ring, and records what it drew. */
export function drawBlastFrontPools(pools: BlastFrontPools): void {
  uploadColoured(pools.fire.pool, FIRE_Z)
  uploadColoured(pools.dust.pool, DUST_Z)
  pools.counts.isFlashShown = drawFlashball(pools.flashball)
  pools.counts.isShockwaveShown = drawShockwave(pools.shockwave)
  recordFrameDraw(pools)
}

/** Aims the spray scratch from `x, y` along a unit direction with a kind's motion. */
export function aimSpray(
  spray: Spray,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  speed: number,
  spreadRadians: number,
  lifeSeconds: number,
): Spray {
  spray.x = x
  spray.y = y
  spray.dirX = dirX
  spray.dirY = dirY
  spray.speed = speed
  spray.spreadRadians = spreadRadians
  spray.lifeSeconds = lifeSeconds
  return spray
}

function recordFrameDraw(pools: BlastFrontPools): void {
  const { counts } = pools
  counts.fire = pools.fire.pool.pool.count
  counts.dust = pools.dust.pool.pool.count
  raisePeak(blastFrontPresence.peak, frontLayerDrawOf(counts))
}

function ringThrowOf(
  pool: ColouredPointPool,
  speed: number,
  spreadRadians: number,
  lifeSeconds: number,
  colour: string,
): RingThrow {
  return { pool, speed, spreadRadians, lifeSeconds, colour: rgbOfHex(colour) }
}

function throwAcrossRing(
  pools: BlastFrontPools,
  ring: RingThrow,
  front: QueuedFront,
  count: number,
  random: SeededRandom,
): void {
  for (let thrown = 0; thrown < count; thrown++) {
    pickRingPoint(pools, front, random, ring)
    sprayColoured(ring.pool, random, pools.spray, 1, ring.colour)
  }
}

/** Debris goes to the kernel spray at high priority: a held gun's tracer never takes its room. */
function throwDebrisAcrossRing(
  pools: BlastFrontPools,
  front: QueuedFront,
  count: number,
  random: SeededRandom,
): void {
  for (let thrown = 0; thrown < count; thrown++) {
    pickRingPoint(pools, front, random, pools.dust)
    requestDebrisAtSpray(pools)
  }
}

/** One kernel debris piece from where the spray scratch points. */
export function requestDebrisAtSpray(pools: BlastFrontPools): void {
  const { spray, debris } = pools
  debris.x = spray.x
  debris.y = spray.y
  debris.dirX = spray.dirX
  debris.dirY = spray.dirY
  requestSpray(debris)
}

/** Aims the spray scratch at a random point on the slice's ring, pointing out from the centre. */
function pickRingPoint(
  pools: BlastFrontPools,
  front: QueuedFront,
  random: SeededRandom,
  ring: RingThrow,
): void {
  const { centre } = pools
  const angle = random.nextFloat() * FULL_TURN
  const reachMm = front.rInnerMm + random.nextFloat() * (front.rOuterMm - front.rInnerMm)
  const dirX = Math.cos(angle)
  const dirY = Math.sin(angle)
  aimSpray(
    pools.spray,
    centre.x + (dirX * reachMm) / MM_PER_METRE,
    centre.y + (dirY * reachMm) / MM_PER_METRE,
    dirX,
    dirY,
    ring.speed,
    ring.spreadRadians,
    ring.lifeSeconds,
  )
}
