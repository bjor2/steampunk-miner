/**
 * How hard a block is to drill, from the planet's tier and the block's depth.
 *
 * NUMBER TYPE: plain `number` (IEEE double). It stays finite up to tier ~5000 with a 1.15 growth
 * and carries ~15-16 significant digits, so money like 1e100 is representable but not exact.
 * Design doc section 5 asks for effectively infinite scaling: before real balance work, move
 * the big values to a log-space or decimal type (for example storing log10) behind this same
 * function signature. Callers must not rely on the representation.
 *
 * Shape (placeholder, constants in constants/balance.ts):
 *   hardness = base * growth^tier * (1 + slope * depth)
 */
import {
  BASE_BLOCK_HARDNESS,
  HARDNESS_DEPTH_SLOPE,
  HARDNESS_GROWTH_PER_TIER,
} from '../constants/balance'

/**
 * @param planetTier whole number >= 0 (design doc section 4: vertical scaling by planet tier)
 * @param depth fraction of the way from the surface (0) to the core (1)
 */
export function blockHardness(planetTier: number, depth: number): number {
  assertValidTier(planetTier)
  assertValidDepth(depth)
  return BASE_BLOCK_HARDNESS * HARDNESS_GROWTH_PER_TIER ** planetTier * depthFactor(depth)
}

function depthFactor(depth: number): number {
  return 1 + HARDNESS_DEPTH_SLOPE * depth
}

function assertValidTier(planetTier: number): void {
  if (!Number.isInteger(planetTier) || planetTier < 0) {
    throw new RangeError(`planetTier must be a whole number >= 0, got ${planetTier}`)
  }
}

function assertValidDepth(depth: number): void {
  if (!Number.isFinite(depth) || depth < 0 || depth > 1) {
    throw new RangeError(`depth must be a fraction in [0, 1], got ${depth}`)
  }
}
