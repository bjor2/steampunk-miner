/**
 * The kernel spray pool's rules (ticket 348, the TD kernel lock on #314 section 4): one fixed pool
 * of sparks, dust and debris any user fills by request. A low-priority request (the bore gun's
 * tracer) fills at most `lowMost` of it; a high one (a blast's debris) evicts low pieces when the
 * pool is full, so tracer drops first and a blast throws its full counts. Whatever finds no room
 * is dropped and counted. Visual only: nothing here reaches yield, pickup or the authority.
 * Emitting, stepping and evicting never allocate.
 */
import {
  SPRAY_CAPACITY,
  SPRAY_LOOKS,
  SPRAY_LOW_PRIORITY_MOST,
  SPRAY_SEED,
} from '../../constants/spray'
import { createSeededRandom, type SeededRandom } from '../seededRandom'
import {
  advanceParticle,
  createParticlePool,
  removeParticleAt,
  sprayParticles,
  type ParticlePool,
  type Spray,
} from './particles'

export const SPRAY_KINDS = ['spark', 'dust', 'debris'] as const
export type SprayKind = (typeof SPRAY_KINDS)[number]

/** `high` for a blast, which always finds room; `low` for anything that may drop first. */
export type SprayPriority = 'high' | 'low'

/** `count` pieces of `kind` from one planet point, in a cone round the unit `dirX, dirY`. */
export interface SprayRequest {
  kind: SprayKind
  x: number
  y: number
  dirX: number
  dirY: number
  count: number
  priority: SprayPriority
}

/** What the pool was asked for, what found no room, and the low pieces a blast pushed out. */
export interface SprayTally {
  requested: number
  dropped: number
  evicted: number
}

/** Where the pool's positions are measured from, metres on the planet (the render origin). */
export interface SprayOrigin {
  x: number
  y: number
}

export interface SprayPool {
  particles: ParticlePool
  /** Each live piece's index in `SPRAY_KINDS`. */
  kinds: Uint8Array
  /** 1 for a low-priority piece. */
  isLow: Uint8Array
  lowCount: number
  lowMost: number
  random: SeededRandom
  /** Scratch: the cone one request throws. */
  spray: Spray
}

export function createSprayPool(
  capacity: number = SPRAY_CAPACITY,
  lowMost: number = SPRAY_LOW_PRIORITY_MOST,
): SprayPool {
  return {
    particles: createParticlePool(capacity),
    kinds: new Uint8Array(capacity),
    isLow: new Uint8Array(capacity),
    lowCount: 0,
    lowMost,
    random: createSeededRandom(SPRAY_SEED),
    spray: { x: 0, y: 0, dirX: 0, dirY: 1, speed: 0, spreadRadians: 0, lifeSeconds: 0 },
  }
}

/** Throws what the request may have, measured from `origin`, and counts what it could not. */
export function admitSpray(
  pool: SprayPool,
  request: SprayRequest,
  origin: SprayOrigin,
  tally: SprayTally,
): void {
  if (request.priority === 'high') evictLowPiecesFor(pool, request.count, tally)
  const admitted = roomFor(pool, request)
  throwPieces(pool, request, origin, admitted)
  countAdmission(tally, request.count, admitted)
}

export function stepSprayPool(pool: SprayPool, dt: number): void {
  let at = 0
  while (at < pool.particles.count) {
    if (advanceParticle(pool.particles, at, dt)) at++
    else removePieceAt(pool, at)
  }
}

export function kindAt(pool: SprayPool, at: number): SprayKind {
  return SPRAY_KINDS[pool.kinds[at]]
}

/** A piece's side, metres: its kind's size, shrinking to nothing over its life. */
export function pieceSizeAt(pool: SprayPool, at: number): number {
  const { age, life } = pool.particles
  return SPRAY_LOOKS[kindAt(pool, at)].sizeM * (1 - age[at] / life[at])
}

/** A piece's turn, radians: its slot sets it off, its kind's spin tumbles it. */
export function pieceTurnAt(pool: SprayPool, at: number): number {
  return at + pool.particles.age[at] * SPRAY_LOOKS[kindAt(pool, at)].spinRadiansPerSecond
}

function roomFor(pool: SprayPool, request: SprayRequest): number {
  const free = pool.particles.capacity - pool.particles.count
  const lowRoom = request.priority === 'low' ? pool.lowMost - pool.lowCount : free
  return Math.max(0, Math.min(request.count, free, lowRoom))
}

/** Frees room for `count` high pieces by dropping low ones, newest slots first. */
function evictLowPiecesFor(pool: SprayPool, count: number, tally: SprayTally): void {
  let short = count - (pool.particles.capacity - pool.particles.count)
  for (let at = pool.particles.count - 1; at >= 0 && short > 0; at--) {
    if (pool.isLow[at] === 0) continue
    removePieceAt(pool, at)
    tally.evicted++
    short--
  }
}

function throwPieces(
  pool: SprayPool,
  request: SprayRequest,
  origin: SprayOrigin,
  count: number,
): void {
  const first = pool.particles.count
  aimSpray(pool.spray, request, origin)
  sprayParticles(pool.particles, pool.random, pool.spray, count)
  markPieces(pool, request, first, pool.particles.count)
}

function aimSpray(spray: Spray, request: SprayRequest, origin: SprayOrigin): void {
  const look = SPRAY_LOOKS[request.kind]
  spray.x = request.x - origin.x
  spray.y = request.y - origin.y
  spray.dirX = request.dirX
  spray.dirY = request.dirY
  spray.speed = look.speed
  spray.spreadRadians = look.spreadRadians
  spray.lifeSeconds = look.lifeSeconds
}

function markPieces(pool: SprayPool, request: SprayRequest, from: number, to: number): void {
  const kind = SPRAY_KINDS.indexOf(request.kind)
  const isLow = request.priority === 'low' ? 1 : 0
  for (let at = from; at < to; at++) {
    pool.kinds[at] = kind
    pool.isLow[at] = isLow
  }
  pool.lowCount += isLow * (to - from)
}

function removePieceAt(pool: SprayPool, at: number): void {
  const last = pool.particles.count - 1
  pool.lowCount -= pool.isLow[at]
  pool.kinds[at] = pool.kinds[last]
  pool.isLow[at] = pool.isLow[last]
  removeParticleAt(pool.particles, at)
}

function countAdmission(tally: SprayTally, requested: number, admitted: number): void {
  tally.requested += requested
  tally.dropped += requested - admitted
}
