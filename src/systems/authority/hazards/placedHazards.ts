/**
 * Hazards a scenario placed (ticket 848, "the scenario API can place each hazard"): the session's
 * optional `placedHazards`, a hazard kind by cell (`tx,ty`), read before the planet's own pockets
 * (`hazardCells.ts`), so a spec or a Playwright run can set any kind beside the rig on any planet.
 * Only `debug.placeHazard` writes it, so it is absent in play and a session that never placed one
 * digests as before; another planet starts with none.
 */
import type { TilePoint } from '../../world/tileGrid'
import type { AuthorityState } from '../authorityState'

/** A hazard kind by cell key `tx,ty`. */
export type PlacedHazards = Readonly<Record<string, string>>

const CELL_KEY = /^-?(0|[1-9]\d*),-?(0|[1-9]\d*)$/

export function placedHazardKindAt(state: AuthorityState, tile: TilePoint): string | null {
  return state.placedHazards?.[cellKeyOf(tile)] ?? null
}

export function withPlacedHazard(
  state: AuthorityState,
  tile: TilePoint,
  kind: string,
): AuthorityState {
  return { ...state, placedHazards: { ...state.placedHazards, [cellKeyOf(tile)]: kind } }
}

/** The state with no placed hazard, as another planet starts. */
export function withoutPlacedHazards(state: AuthorityState): AuthorityState {
  if (state.placedHazards === undefined) return state
  const { placedHazards: _left, ...rest } = state
  return rest
}

/** A copy of the placed hazards under their key, or no key at all while none is placed. */
export function placedHazardsFieldOf(placed: PlacedHazards | undefined): {
  placedHazards?: Record<string, string>
} {
  return placed === undefined ? {} : { placedHazards: { ...placed } }
}

/** Why a snapshot's placed hazards are malformed; empty when absent or well formed. */
export function portablePlacedHazardsProblems(value: unknown, path: string): string[] {
  if (value === undefined) return []
  const isValid =
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).length > 0 &&
    Object.entries(value).every(([key, kind]) => CELL_KEY.test(key) && isKindText(kind))
  return isValid ? [] : [`${path} must map cells tx,ty to hazard kinds, or be left out`]
}

function isKindText(kind: unknown): boolean {
  return typeof kind === 'string' && kind !== ''
}

function cellKeyOf(tile: TilePoint): string {
  return `${tile.tx},${tile.ty}`
}
