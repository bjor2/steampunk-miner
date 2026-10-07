/**
 * The `facility` schedule rows (#79 bind) the platform has built by the time it stands on a
 * planet: the kernel's Refinery bay (#105) and the buildings slices stamp onto the dock through
 * the dock-building registry (#221). `isFeatureUnlocked` and travel's `FeatureUnlocked` read it.
 */
import { dockFacilityRowIdsOn } from '../registries/dockFacilities'
import { hasRefineryOn, REFINERY_BAY_ROW_ID } from './refinery/refineryFacility'

const NO_FACILITY_ROWS: ReadonlySet<string> = new Set()
const REFINERY_ROWS: ReadonlySet<string> = new Set([REFINERY_BAY_ROW_ID])

/** The `facility` rows the platform has built by the time it stands on `planetIndex`. */
export function builtFacilityRowIdsOn(planetIndex: number): ReadonlySet<string> {
  return withRowIds(refineryRowIdsOn(planetIndex), dockFacilityRowIdsOn(planetIndex))
}

function refineryRowIdsOn(planetIndex: number): ReadonlySet<string> {
  return hasRefineryOn(planetIndex) ? REFINERY_ROWS : NO_FACILITY_ROWS
}

/** Shares the constant set when no dock building stands, as `isFeatureUnlocked` runs every tick. */
function withRowIds(rowIds: ReadonlySet<string>, more: readonly string[]): ReadonlySet<string> {
  return more.length === 0 ? rowIds : new Set([...rowIds, ...more])
}
