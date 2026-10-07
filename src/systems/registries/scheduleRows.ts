/**
 * Where each row of the locked horizontal schedule (docs/scaling/horizontal/stats.json) lives: the
 * Horizontal Scaler's review of the slice standard (#155), built with K1 (#184). A row has exactly
 * one home: one registered entry that claims it through its `scheduleRowId`, or the generated
 * list, or the deferred list below. The coverage spec fails on a row with none or with two.
 *
 * Both lists only shrink. A slice that ships a row registers the entry that claims it and deletes
 * the row here in the same commit. The registry kinds the review names (`enemy-kind`,
 * `planet-archetype`, `dock-building`, `artefact`, `wagon`) are not built ahead of their rows:
 * each opens as a kernel ticket with the first slice that ships a row of that kind. `dock-building`
 * is open: `dockFacilities.ts` (#221).
 */

/** What a deferred row waits for: the registry kind that will hold it, or none named yet. */
export type DeferredScheduleHome =
  | 'enemy-kind'
  | 'planet-archetype'
  | 'dock-building'
  | 'artefact'
  | 'wagon'
  /** A tech-tree node (`unlockVia: tech_tree`, #162), registered by the tech-tree slice (#165). */
  | 'tech-node'
  /** No registry kind names it: shipped rows live in kernel code, the rest await a slice. */
  | 'unclaimed'

/** Rows of generated endless content. Marks, combos, cycles and echo have no rows today. */
export const GENERATED_SCHEDULE_ROWS: readonly string[] = []

export const DEFERRED_SCHEDULE_ROWS: Readonly<Record<DeferredScheduleHome, readonly string[]>> = {
  'enemy-kind': [
    'crawler',
    'burrower',
    'tunnel_wrecker',
    'magma_tick',
    'core_guardian',
    'frost_spitter',
    'swarm_nests',
    'ore_thief',
    'emp_mite',
  ],
  'planet-archetype': ['heat_lava', 'frozen_planets', 'magnetic_planets', 'hollow_planets'],
  'dock-building': [
    'sell_upgrade_loop',
    'mobile_platform',
    'two_bay_shops',
    'refinery_bay',
    'merchants',
    'quest_office',
    'core_forge',
  ],
  artefact: [
    'artefacts',
    'ore_whisper',
    'breathing_room',
    'assay_beacon',
    'artefact_set_1',
    'artefact_set_2',
    'artefact_set_3',
    'artefact_set_4',
    'artefact_set_5',
    'archive_cache',
  ],
  wagon: ['wagons'],
  'tech-node': ['side_drills'],
  unclaimed: [
    'core_harvest',
    'planet_2',
    'fluid_ground',
    'casing_cement',
    'collapse_vacuum',
    'music_layers',
    'auto_guns',
    'blasting_charges',
    'refractory_lining',
    'insulated_lining',
    'grounded_lining',
    'relic_planet',
    'unstable_cores',
    'finale',
    'endless_unlock',
    'finale_key',
  ],
}

/** Every place a row is homed: claims by registered entries, and the two lists. */
export interface ScheduleRowHomes {
  claims: readonly { rowId: string; entryId: string }[]
  generated: readonly string[]
  deferred: Readonly<Record<string, readonly string[]>>
}

/** A row with no home or more than one, and a home naming no row of the schedule. */
export function scheduleRowHomeProblems(
  rowIds: readonly string[],
  homes: ScheduleRowHomes,
): string[] {
  const placesByRow = placesOfRows(homes)
  return [
    ...rowIds.flatMap((rowId) => rowHomeProblems(rowId, placesByRow.get(rowId) ?? [])),
    ...strayRowProblems(rowIds, placesByRow),
  ]
}

function placesOfRows(homes: ScheduleRowHomes): Map<string, string[]> {
  const places = new Map<string, string[]>()
  const note = (rowId: string, place: string) =>
    places.set(rowId, [...(places.get(rowId) ?? []), place])
  homes.claims.forEach(({ rowId, entryId }) => note(rowId, `entry "${entryId}"`))
  homes.generated.forEach((rowId) => note(rowId, 'the generated list'))
  Object.entries(homes.deferred).forEach(([home, rowIds]) =>
    rowIds.forEach((rowId) => note(rowId, `the deferred list (${home})`)),
  )
  return places
}

function rowHomeProblems(rowId: string, places: readonly string[]): string[] {
  if (places.length === 1) return []
  if (places.length === 0) return [`schedule row "${rowId}" has no home`]
  return [`schedule row "${rowId}" has ${places.length} homes: ${places.join(', ')}`]
}

function strayRowProblems(rowIds: readonly string[], places: Map<string, string[]>): string[] {
  const known = new Set(rowIds)
  return [...places.entries()]
    .filter(([rowId]) => !known.has(rowId))
    .map(([rowId, homes]) => `${homes.join(', ')} names "${rowId}", which is no schedule row`)
}
