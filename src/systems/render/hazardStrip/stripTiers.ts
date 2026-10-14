/**
 * The hazard strip's cost tiers (TD scope g 4 on #316, ticket 341), chosen per frame against the
 * 0.5 ms main-thread budget from a cost model, so the choice is the same on every machine and in a
 * spec; `npm run bench:strip` measures what the frame really costs.
 *
 * - Tier 1: every tile of the 3-cell line, exact (seed plus edits).
 * - Tier 2 is the chunk worker's full-chunk summary (exact ore pips, TD scope c2). It is wired once
 *   that worker lands (ticket 337); until then tier 1 reads the patches itself.
 * - Tier 3: the cave lattice's blocks, a "may contain" per 8 m, conservative.
 * - Tier 4: the bands the path crosses, a fixed number of reads whatever the window's length.
 *
 * A coarser tier never shortens the window: tier 4 covers any window, so some tier always fits.
 */
import {
  STRIP_BAND_READ_US,
  STRIP_BAND_STEPS,
  STRIP_BLOCK_READ_US,
  STRIP_CHUNK_SETUP_US,
  STRIP_PATH_STEP_US,
  STRIP_SIDE_CELLS,
  STRIP_TILE_READ_US,
} from '../../../constants/hazardStrip'
import { CAVE_LATTICE_TILES } from '../../world/baseTerrain'
import { CHUNK_SIZE } from '../../world/tileGrid'

export const STRIP_TIER = { exact: 1, lattice: 3, band: 4 } as const

export type StripTier = (typeof STRIP_TIER)[keyof typeof STRIP_TIER]

/** Tiles read across the line at each step: the bore and its sides. */
export const LINE_TILES = 1 + 2 * STRIP_SIDE_CELLS

/** What scanning `steps` metres of the line at `tier` costs, in microseconds. */
export function scanCostUs(tier: StripTier, steps: number): number {
  if (steps <= 0) return 0
  if (tier === STRIP_TIER.exact) return exactScanCostUs(steps)
  if (tier === STRIP_TIER.lattice) return latticeScanCostUs(steps)
  return STRIP_BAND_STEPS * (STRIP_PATH_STEP_US + LINE_TILES * STRIP_BAND_READ_US)
}

/** The finest tier that scans `steps` metres within `budgetUs`; the band tier always does. */
export function finestTierWithin(steps: number, budgetUs: number): StripTier {
  if (scanCostUs(STRIP_TIER.exact, steps) <= budgetUs) return STRIP_TIER.exact
  if (scanCostUs(STRIP_TIER.lattice, steps) <= budgetUs) return STRIP_TIER.lattice
  return STRIP_TIER.band
}

/** How many metres of exact scan `budgetUs` pays for. */
export function exactStepsWithin(budgetUs: number): number {
  const perStep = EXACT_STEP_US + STRIP_CHUNK_SETUP_US / CHUNK_SIZE
  return Math.max(0, Math.floor((budgetUs - STRIP_CHUNK_SETUP_US) / perStep))
}

/** A metre of path and its three tiles. */
const EXACT_STEP_US = STRIP_PATH_STEP_US + LINE_TILES * STRIP_TILE_READ_US
/** Lattice blocks side by side under a 3-cell line. */
const BLOCKS_ACROSS = 2

/** Every tile, and one chunk set-up for each chunk the line may enter. */
function exactScanCostUs(steps: number): number {
  return steps * EXACT_STEP_US + Math.ceil(steps / CHUNK_SIZE) * STRIP_CHUNK_SETUP_US
}

/** A metre of path each step, and one read for each lattice block the line crosses. */
function latticeScanCostUs(steps: number): number {
  const blocksAlong = Math.ceil(steps / CAVE_LATTICE_TILES) + 1
  return steps * STRIP_PATH_STEP_US + blocksAlong * BLOCKS_ACROSS * STRIP_BLOCK_READ_US
}
