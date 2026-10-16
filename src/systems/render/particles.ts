/**
 * The small particle set of #13 VFX (sparks now; dust and steam reuse it): a fixed pool in flat
 * arrays, so emitting and stepping never allocate. Particles fly in straight lines and die when
 * their life runs out; a dead particle's slot is filled by the last live one.
 *
 * A pool may emit a share of what it is asked for (ticket 477, #173 "particle counts are halved"
 * on phones): it reads its `ParticleShare` live and carries the fractions, so half of a steady
 * rate is exactly half over time and a share of 1 emits every particle. The sparks, the refinery
 * smoke and the cement spray read the render quality's share; pools made without one (the blast
 * front, the spray layer, the collapse telegraph's warning dust) emit all.
 */
import type { SeededRandom } from '../seededRandom'

export interface ParticlePool {
  capacity: number
  count: number
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  vy: Float32Array
  age: Float32Array
  life: Float32Array
  share: ParticleShare
  /** The fraction of a particle the share left owing, so a share holds across sprays. */
  shareOwed: number
}

/** The share of their particles the pools that read it emit, 0 to 1; read at every spray. */
export interface ParticleShare {
  readonly particleShare: number
}

/** Every particle asked for. */
export const FULL_PARTICLE_SHARE: ParticleShare = { particleShare: 1 }

/** A cone of particles from one point. `dirX, dirY` is a unit vector. */
export interface Spray {
  x: number
  y: number
  dirX: number
  dirY: number
  speed: number
  spreadRadians: number
  lifeSeconds: number
}

/** Fractional particles owed between frames, so a rate holds at any frame rate. */
export interface EmissionCarry {
  owed: number
}

export function createParticlePool(
  capacity: number,
  share: ParticleShare = FULL_PARTICLE_SHARE,
): ParticlePool {
  return {
    capacity,
    count: 0,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    age: new Float32Array(capacity),
    life: new Float32Array(capacity),
    share,
    shareOwed: 0,
  }
}

/** How many particles a steady `perSecond` rate owes for this `dt`. */
export function particlesDue(carry: EmissionCarry, perSecond: number, dt: number): number {
  const owed = carry.owed + perSecond * dt
  const due = Math.floor(owed)
  carry.owed = owed - due
  return due
}

/** Adds up to the pool's share of `count` particles; a full pool takes no more. */
export function sprayParticles(
  pool: ParticlePool,
  random: SeededRandom,
  spray: Spray,
  count: number,
): void {
  const room = Math.min(sharedCountOf(pool, count), pool.capacity - pool.count)
  for (let added = 0; added < room; added++) addParticle(pool, random, spray)
}

/** The whole particles the pool's share of `count` comes to, with the fraction carried. */
function sharedCountOf(pool: ParticlePool, count: number): number {
  const owed = pool.shareOwed + count * pool.share.particleShare
  const due = Math.floor(owed)
  pool.shareOwed = owed - due
  return due
}

export function stepParticles(pool: ParticlePool, dt: number): void {
  let at = 0
  while (at < pool.count) {
    if (advanceParticle(pool, at, dt)) at++
    else removeParticleAt(pool, at)
  }
}

/** Ages and moves one particle; false once its life has run out, leaving it for the caller. */
export function advanceParticle(pool: ParticlePool, at: number, dt: number): boolean {
  pool.age[at] += dt
  if (pool.age[at] >= pool.life[at]) return false
  pool.x[at] += pool.vx[at] * dt
  pool.y[at] += pool.vy[at] * dt
  return true
}

/**
 * Moves every live particle by whole metres: a pool measured from the render origin follows it to
 * a new chunk corner (ticket 339), so the particles stay where they were on the planet.
 */
export function shiftParticles(pool: ParticlePool, dx: number, dy: number): void {
  for (let at = 0; at < pool.count; at++) {
    pool.x[at] += dx
    pool.y[at] += dy
  }
}

function addParticle(pool: ParticlePool, random: SeededRandom, spray: Spray): void {
  const turn = (2 * random.nextFloat() - 1) * spray.spreadRadians
  const speed = spray.speed * (0.5 + 0.5 * random.nextFloat())
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const at = pool.count
  pool.x[at] = spray.x
  pool.y[at] = spray.y
  pool.vx[at] = (spray.dirX * cos - spray.dirY * sin) * speed
  pool.vy[at] = (spray.dirX * sin + spray.dirY * cos) * speed
  pool.age[at] = 0
  pool.life[at] = spray.lifeSeconds * (0.6 + 0.4 * random.nextFloat())
  pool.count = at + 1
}

/** Frees a particle's slot: the last live particle moves into it. */
export function removeParticleAt(pool: ParticlePool, at: number): void {
  const last = pool.count - 1
  pool.x[at] = pool.x[last]
  pool.y[at] = pool.y[last]
  pool.vx[at] = pool.vx[last]
  pool.vy[at] = pool.vy[last]
  pool.age[at] = pool.age[last]
  pool.life[at] = pool.life[last]
  pool.count = last
}
