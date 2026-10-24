/**
 * The solar-systems slice's registration: no side effects at import; the loader calls `register`.
 * The palette and the roster are pure reads (ticket 775); the only registration is the debug surface
 * that re-prints a system's seeded roster, so the picks a planner reads are the generator's own.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { solarSystemsDebugActions } from './debug'

export const slice: SliceDefinition = {
  id: 'solar-systems',
  register(r) {
    // steampunkDebug.features['solar-systems'].describe(), .rosterOf(system, worldSeed)
    r.debugActions(solarSystemsDebugActions)
  },
}
