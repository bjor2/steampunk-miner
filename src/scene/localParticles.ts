/**
 * Particle pools measured from the render origin (ticket 339): their f32 buffers hold render-local
 * metres, so a spark keeps sub-millimetre precision at any planet radius. A pool remembers the origin
 * its particles were measured from and, when the origin moves, shifts the live ones by the same whole
 * metres, so none pops; new ones spray from a planet point less the origin.
 */
import { shiftParticles, type ParticlePool } from '../systems/render/particles'
import { renderOriginPresence } from './renderOriginPresence'

/** The render origin, in metres, a pool's particles were last measured from. */
export interface PoolOrigin {
  x: number
  y: number
}

export function createPoolOrigin(): PoolOrigin {
  return { x: renderOriginPresence.x, y: renderOriginPresence.y }
}

/** Call before stepping: the live particles stay where they are on the planet. */
export function followRenderOrigin(pool: ParticlePool, seen: PoolOrigin): void {
  if (seen.x === renderOriginPresence.x && seen.y === renderOriginPresence.y) return
  shiftParticles(pool, seen.x - renderOriginPresence.x, seen.y - renderOriginPresence.y)
  seen.x = renderOriginPresence.x
  seen.y = renderOriginPresence.y
}
