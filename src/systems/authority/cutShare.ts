/**
 * The per-cell cut budget at any speed (TD scope b on #316, as the Producer rewrote it on 8 Oct;
 * ticket 335). The budget picks how a tick is cut, never how far: it never slows motion.
 *
 * - **Per-cell path budget**: a drill step whose stamp and gear touch at most its share of
 *   `DRILL_CELLS_PER_TICK` density cells (about 2 ms, `terrainBudget.ts`) is cut by the per-cell
 *   walk; one over it switches to the swept span (`sweptSpanDrill.ts`, ticket 374) instead of
 *   carrying the rest. Either walk cuts the whole clear sweep, the same bytes, so the authority's
 *   result is complete every tick. Raise the budget past 32 only after re-measuring it on the
 *   reference machine.
 * - **Co-op share**, round-robin per player in player-id order: each is guaranteed
 *   `floor(budget / players)` (the first player also the remainder), and a player who stepped this
 *   tick passes what its step left of its share to the next player in id order. A share is never
 *   counted twice, so the tick's per-cell work stays inside the budget; a player whose share runs
 *   out is cut by the span, never held back.
 * - **Rings share the budget**: the cells of the casing rings a step lays come off what it passes on.
 *
 * What a step passed on rides on its cursor (`cutSharePassed`), saved and digested only once a
 * `drillStep` has been sent (`drill.sweptCut`).
 */
import { DENSITY_CELL_UNITS, TERRAIN_EDIT_UNITS_PER_TICK } from '../../constants/terrainBudget'
import type { SweptCut } from '../vehicle/sweptCut'
import { SAMPLES_PER_CELL } from '../world/sampleGrid'
import type { DiscStamp } from '../world/stampShape'
import { stampCellsUpTo } from '../world/sweptSpan'
import { vehicleOf, type AuthorityState } from './authorityState'
import type { DomainEventBody } from './domainEvent'
import type { DrillGearRead } from './drillGearCut'

/** Density cells the per-cell walk may touch a tick, shared by every player: the terrain budget. */
export const DRILL_CELLS_PER_TICK = TERRAIN_EDIT_UNITS_PER_TICK / DENSITY_CELL_UNITS

/** The per-cell cells a player's step at `state.tick` may touch. */
export function perCellShareAt(state: AuthorityState, playerId: string): number {
  const ids = Object.keys(state.players).sort()
  const index = ids.indexOf(playerId)
  const previous = index > 0 ? ids[index - 1] : null
  return guaranteedShareOf(DRILL_CELLS_PER_TICK, ids.length, index) + passedBy(state, previous)
}

/** `floor(budget / players)`, the first player in id order also taking the remainder. */
export function guaranteedShareOf(budget: number, players: number, index: number): number {
  const share = Math.floor(budget / players)
  return index === 0 ? share + (budget % players) : share
}

/** What the previous player's step this tick left of its share; nothing before it stepped. */
function passedBy(state: AuthorityState, playerId: string | null): number {
  if (playerId === null) return 0
  const cursor: SweptCut | undefined = vehicleOf(state, playerId).sweptCut
  return cursor !== undefined && cursor.tick === state.tick ? cursor.cutSharePassed : 0
}

/**
 * The density cells a step's stamp and its gear's cells reach, counted no further than `share + 1`
 * (anything over the share switches the step to the span).
 */
export function cutCellsWithin(disc: DiscStamp, read: DrillGearRead | null, share: number): number {
  const gearCells = [...(read?.aheadCells ?? []), ...(read?.sideCells ?? [])]
  const seeded = new Set(gearCells.map(({ tx, ty }) => `${tx},${ty}`))
  return stampCellsUpTo(disc, seeded, share)
}

/** Whether a step touching `cells` is cut by the per-cell walk: it fits its share. */
export function isWithinShare(cells: number, share: number): boolean {
  return cells <= share
}

/** What a step leaves of its share for the next player: none once its cut went over it. */
export function sharePassedOf(share: number, cells: number): number {
  return Math.max(0, share - cells)
}

/** The share passed on, less the cells of the rings the step laid (`CasingPlaced` samples). */
export function sharePassedAfterRings(passed: number, events: readonly DomainEventBody[]): number {
  return Math.max(0, passed - ringCellsOf(events))
}

function ringCellsOf(events: readonly DomainEventBody[]): number {
  const samples = events.reduce(
    (sum, event) => sum + (event.type === 'CasingPlaced' ? event.samples : 0),
    0,
  )
  return Math.ceil(samples / SAMPLES_PER_CELL)
}
