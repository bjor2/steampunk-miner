/**
 * An offset start for the casing ladder specs (ticket 829): a fake slice whose planet-row provider
 * lifts one planet's surface grade by `lead` over the ladder's default, registered through
 * `withRegistrations` so no real slice is imported. No authored offset ships.
 */
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { defaultCasingSurfaceGrade, type PlanetRowFields } from './planetRow'

export function offsetStartSlice(planetIndex: number, lead: bigint): SliceDefinition {
  return {
    id: 'offset-probe',
    register(r) {
      r.planetRow({
        id: 'offset-probe.row',
        rowOf: (planet): PlanetRowFields =>
          planet === planetIndex
            ? { casingSurfaceGrade: defaultCasingSurfaceGrade(planet) + lead }
            : {},
      })
    },
  }
}
