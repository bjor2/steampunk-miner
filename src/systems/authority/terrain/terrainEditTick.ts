/**
 * The power-up share of the world's terrain edits on a tick (K6 #189): the cells the plan gives
 * this tick (`terrainEditPlan.ts`) change, density edits first, then swaps, and every chunk they
 * changed says so in one `GroundChanged`. The rest of the queue waits for the next tick. It runs on
 * the clock after the live blasts' slice, so a power-up never takes a blast's tiles, and a gated
 * ore cell stands as solid ground (`terrainEditGates.ts`, #142).
 */
import type { GroundChange } from '../../world/groundEditSession'
import type { PlanetParams } from '../../world/planetParams'
import { setTileDensities, swapTileCells } from '../../world/terrainCellEdits'
import { chunkKey } from '../../world/tileGrid'
import type { WorldState } from '../../world/worldState'
import type { AuthorityState } from '../authorityState'
import type { TickOutcome } from '../combat/combatTick'
import type { DomainEvent } from '../domainEvent'
import { groundChangedEventsOf } from '../groundChangedEvents'
import { planetParamsOf } from '../planetOfState'
import { cellsToolMayChange } from './terrainEditGates'
import { planTerrainEditTick } from './terrainEditPlan'
import { NO_TERRAIN_EDITS, type TerrainCellEdit } from './terrainEdits'

export function applyQueuedTerrainEdits(state: AuthorityState, tick: number): TickOutcome {
  const params = planetParamsOf(state.planet)
  if (state.terrainEdits.length === 0) return { state, events: [] }
  if (params === null) return { state: { ...state, terrainEdits: NO_TERRAIN_EDITS }, events: [] }
  const plan = planTerrainEditTick(state.terrainEdits)
  const edited = editedWorldOf(
    state.world,
    params,
    plan.applied.flatMap((edit) => cellsToolMayChange(state, params, edit)),
  )
  return {
    state: { ...state, world: edited.world, terrainEdits: plan.queue },
    events: groundChangedEventsOf(edited).map((body): DomainEvent => ({ tick, ...body })),
  }
}

function editedWorldOf(
  world: WorldState,
  params: PlanetParams,
  cells: readonly TerrainCellEdit[],
): { world: WorldState; changes: GroundChange[] } {
  const densities = setTileDensities(world, params, densityCellsOf(cells))
  const swaps = swapTileCells(densities.world, swapCellsOf(cells))
  return { world: swaps.world, changes: mergedByChunk([...densities.changes, ...swaps.changes]) }
}

function densityCellsOf(cells: readonly TerrainCellEdit[]) {
  return cells.flatMap((cell) => (cell.kind === 'density' ? [cell] : []))
}

function swapCellsOf(cells: readonly TerrainCellEdit[]) {
  return cells.flatMap((cell) => (cell.kind === 'swap' ? [cell] : []))
}

/** One change per chunk, its rectangle covering every change made to it, in first-change order. */
function mergedByChunk(changes: readonly GroundChange[]): GroundChange[] {
  const byChunk = new Map<string, GroundChange>()
  for (const change of changes) {
    const key = chunkKey(change.cx, change.cy)
    const known = byChunk.get(key)
    byChunk.set(key, known === undefined ? { ...change } : coveringBoth(known, change))
  }
  return [...byChunk.values()]
}

function coveringBoth(a: GroundChange, b: GroundChange): GroundChange {
  return {
    cx: a.cx,
    cy: a.cy,
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }
}
