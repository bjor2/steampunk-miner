/**
 * The authority's terrain-edit budget per tick (Technical Director, #154 and its K6 amendments on
 * #189; docs/perf/blast-frame-budget.md). One shared queue for the whole world, in priority order:
 *
 * 1. drill breaks, at most 4 cells per player, always on their tick; the swept cut's per-cell walk
 *    takes its players' shares of the same 32 density cells and goes to the span per chunk over
 *    them, never carrying a cell to a later tick (ticket 335, `authority/cutShare.ts`);
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
/**
 * The swept span's budget (ticket 335, TD scope b on #316 as the Producer rewrote it): chunks one
 * drill step's span may touch a tick, the span costing per chunk it crosses. It never trims or
 * slows a cut: a step past it is a perf bug, and the P200 lane (`moneyPastP200.lane.test.ts`)
 * checks the rig's top cutting step there against it. Set from the TD's P200 figure (6050644115):
 * about 430 m of bore a tick, which a bare stamp's span crosses in at most 31 chunks (a diagonal
 * through chunk corners, `authority/spanBudget.ts`); 40 leaves room for drill-gear cells beside the
 * bore. Re-set it from the figure the lane prints once the #304/#307 re-baseline has run it.
 * Scaled with the lifted sub-step floor (ticket 558): a drill's step is no longer held to 60 m a
 * tick but to the planet's radius, at most 1,000 m on the largest planet, whose bare-stamp span
 * crosses at most 70 chunks; 80 keeps room for the drill-gear cells beside the bore.
 */
export const SWEPT_SPAN_CHUNKS_PER_TICK = 80

/** At most 2 chunks touched per tick: at most 6 render rebuilds, final within 6 frames (#162). */
export const TERRAIN_EDIT_CHUNKS_PER_TICK = 2

/**
 * A live blast checks at most this many rim collapse blocks a tick (#153: the TD caps how many
 * telegraphs start in one tick). #154 measured the one-shot check at ~60 us a block under load
 * (8.2 ms for R21) and put the checks at ~0.33 ms a slice, about 5 blocks; 8 keeps an R24 rim
 * (154 blocks) within ~10 ticks of its last slice.
 */
export const BLAST_COLLAPSE_CHECKS_PER_TICK = 8
