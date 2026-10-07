/**
 * The planet mix's rows in the balance and session reports (#223 `reportRows`; #141 acceptance 8
 * and 9; GD lock on #147). Derived from a run's log, never written into it:
 *
 * - ore theme: the planet's act, `actOf(planet)`, which is #141's `oreThemeId` (the GD lock rules
 *   the derived row satisfies acceptance 8, so `planet_entered` gains no field)
 * - first sighting by type: the depth of the first unit of each ore id collected, signatures marked
 * - signature units: how many signature units were collected (the bot needs none, acceptance 9)
 * - off-mix types: units whose ore id is not in the planet's mix (expected: none)
 * - families before their act: units of a family the acts have not reached yet (expected: none)
 */
import type { ReportRow, ReportRowSource } from '../../logging/registries/reportRows'
import type { RunEvent } from '../../logging/runEvent'
import { oreMixFor } from './systems/oreMix'
import { actOf, firstPlanetOfFamily } from './systems/planetActs'

export const PLANET_MIX_REPORT_ROWS_ID = 'planet-mix.themes'

/** One collected unit as its `resource_collected` line names it. */
interface CollectedOre {
  oreId: string
  /** Absent when no catalogue names it (#223). */
  family?: string
  isSignature: boolean
  depthTiles: number
}

export const planetMixReportRows: ReportRowSource = {
  id: PLANET_MIX_REPORT_ROWS_ID,
  rowsOf: mixRowsOf,
}

function mixRowsOf(events: readonly RunEvent[], worldSeed: number, planet: number): ReportRow[] {
  const units = collectedOresOf(events, planet)
  const themeRow = { label: 'ore theme', value: actOf(planet).id }
  if (units.length === 0) return [themeRow]
  return [
    themeRow,
    firstSightingRow(units),
    signatureUnitsRow(units),
    offMixRow(units, planet, worldSeed),
    familiesBeforeTheirActRow(units, planet),
  ]
}

function collectedOresOf(events: readonly RunEvent[], planet: number): CollectedOre[] {
  return events.filter((event) => event.planet === planet).flatMap(collectedOreOf)
}

function collectedOreOf(event: RunEvent): CollectedOre[] {
  if (event.event !== 'resource_collected') return []
  const { data } = event as RunEvent<'resource_collected'>
  return [
    {
      oreId: data.oreId,
      family: data.family,
      isSignature: data.signature === true,
      depthTiles: data.oreDepthTiles,
    },
  ]
}

function firstSightingRow(units: readonly CollectedOre[]): ReportRow {
  const firsts = new Map<string, CollectedOre>()
  for (const unit of units) if (!firsts.has(unit.oreId)) firsts.set(unit.oreId, unit)
  return {
    label: 'first sighting depth by ore type (tiles below the surface)',
    value: [...firsts.values()].map(sightingOf).join(', '),
  }
}

function sightingOf({ oreId, isSignature, depthTiles }: CollectedOre): string {
  return `${oreId}${isSignature ? ' (signature)' : ''} ${depthTiles}`
}

function signatureUnitsRow(units: readonly CollectedOre[]): ReportRow {
  const signatures = units.filter((unit) => unit.isSignature).length
  return { label: 'signature units collected', value: `${signatures} of ${units.length}` }
}

function offMixRow(units: readonly CollectedOre[], planet: number, worldSeed: number): ReportRow {
  const mixIds = new Set(
    oreMixFor(planet, worldSeed)
      .bands.flat()
      .map((entry) => entry.typeId),
  )
  const offMix = distinctOf(units.map((unit) => unit.oreId).filter((id) => !mixIds.has(id)))
  return { label: 'ore types off the planet mix', value: listOrNone(offMix) }
}

function familiesBeforeTheirActRow(units: readonly CollectedOre[], planet: number): ReportRow {
  const families = units.flatMap((unit) => (unit.family === undefined ? [] : [unit.family]))
  const early = distinctOf(families).filter((family) => planet < firstPlanetOfFamily(family))
  return { label: 'families before their act', value: listOrNone(early) }
}

function distinctOf(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function listOrNone(values: readonly string[]): string {
  return values.length === 0 ? 'none' : values.join(', ')
}
