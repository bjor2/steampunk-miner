/**
 * The authority's terrain-edit budget per tick (Technical Director, #154 and its K6 amendments on
 * #189; docs/perf/blast-frame-budget.md). One shared queue for the whole world, in priority order:
 *
 * 1. drill breaks, at most 4 cells per player, always on their tick;
 * 2. the live blasts' slice: `BLAST_TILES_PER_TICK` tiles, nearest first, always taken in full and
 *    never thinned (2 ms / 26-30 us per tile measured, rounded down to 64);
 * 3. power-up edits, first in first out and round-robin across players, taking what is left of
 *    `TERRAIN_EDIT_UNITS_PER_TICK` and touching at most `TERRAIN_EDIT_CHUNKS_PER_TICK` chunks; the
 *    rest carries over to later ticks.
 *
 * A density cell costs `DENSITY_CELL_UNITS` units and a swap `SWAP_CELL_UNITS`, so a tick takes at
 * most 32 density cells or 64 swaps (the #162 section-3 caps: p50 1.04 ms and 0.19 ms measured).
 */
export const BLAST_TILES_PER_TICK = 64
export const TERRAIN_EDIT_UNITS_PER_TICK = 64
export const DENSITY_CELL_UNITS = 2
export const SWAP_CELL_UNITS = 1
/** At most 2 chunks touched per tick: at most 6 render rebuilds, final within 6 frames (#162). */
export const TERRAIN_EDIT_CHUNKS_PER_TICK = 2
