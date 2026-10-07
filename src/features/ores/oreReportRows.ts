/**
 * The ore catalogue's rows in the balance and session reports (#223 `reportRows`, #140 acceptance
 * 2-5, #146 "the pacing bot and the run log report the first sighting depth per tier"). Derived from
 * a run's log, never written into it. Every row is per seed and planet; the counts are printed whole
 * so three seeds pool by adding them.
 *
 * - first sighting: the depth of the first unit of each tier collected on the planet
 * - deep preview: whether tier `3(p-1)+6` (band 4's +2, next planet's band 3) was collected before
 *   the core was reached (#140 acceptance 3, from planet 2)
 * - lead shares: units per band with a +1 and a +2 lead, of all the band's units
 * - value per unit: the band's mean sale value over `V(t_b)`, beside #140's expected multiplier
 * - lead drill ticks: band 5's median drill ticks per tile by lead, beside `H(t+lead)/H(t)`
 */
import type { ReportRow, ReportRowSource } from '../../logging/registries/reportRows'
import type { RunEvent } from '../../logging/runEvent'
import { oreSalePrice, oreTier } from '../../systems/economy/oreEconomy'
import {
  add,
  div,
  fromSafeInteger,
  mul,
  roundToWhole,
  toSafeInteger,
  type Money,
} from '../../systems/money'
import { BAND_COUNT } from '../../systems/world/planetGeometry'
import { minedOreUnitsOf, type MinedOreUnit } from './minedOreUnits'
import { expectedValueRatio, hardnessRatioOfLead } from './systems/leadPayoff'

export const ORE_REPORT_ROWS_ID = 'ores.sightings'

/** #140 acceptance 3: band 4's +2 lead, the deepest tier a planet previews. */
const DEEP_PREVIEW_BAND = 4
const DEEP_PREVIEW_LEAD = 2
/** #140 acceptance 5 times lead cells in band 5, where the tip's headroom is tightest. */
const TICKS_BAND = 5
const LEADS = [0, 1, 2]
const PER_MILLE = 1000

export const oreReportRows: ReportRowSource = { id: ORE_REPORT_ROWS_ID, rowsOf: oreRowsOf }

function oreRowsOf(events: readonly RunEvent[], worldSeed: number, planet: number): ReportRow[] {
  const units = minedOreUnitsOf(events, worldSeed, planet)
  if (units.length === 0) return []
  return [
    firstSightingRow(units),
    ...deepPreviewRows(units, coreTickOf(events, planet), planet),
    leadShareRow(units),
    valuePerUnitRow(units, planet),
    leadTicksRow(units, planet),
  ]
}

function firstSightingRow(units: readonly MinedOreUnit[]): ReportRow {
  const firsts = new Map<number, number>()
  for (const unit of units) if (!firsts.has(unit.tier)) firsts.set(unit.tier, unit.depthTiles)
  const sightings = [...firsts].sort(([a], [b]) => a - b)
  return {
    label: 'first sighting depth by tier (tiles below the surface)',
    value: sightings.map(([tier, depth]) => `t${tier} ${depth}`).join(', '),
  }
}

/** The tick the planet's core was reached; never when the run stopped before it. */
function coreTickOf(events: readonly RunEvent[], planet: number): number {
  const reached = events.find((event) => event.planet === planet && event.event === 'core_reached')
  return reached?.tick ?? Number.POSITIVE_INFINITY
}

function deepPreviewRows(
  units: readonly MinedOreUnit[],
  coreTick: number,
  planet: number,
): ReportRow[] {
  if (planet < 2) return []
  const tier = oreTier(planet, DEEP_PREVIEW_BAND) + DEEP_PREVIEW_LEAD
  const isSighted = units.some((unit) => unit.tier === tier && unit.tick <= coreTick)
  return [{ label: `tier ${tier} collected before the core`, value: isSighted ? 'yes' : 'no' }]
}

function leadShareRow(units: readonly MinedOreUnit[]): ReportRow {
  return {
    label: 'lead units by band (+1 / +2 of all)',
    value: bandsMined(units)
      .map((band) =>
        leadShareOfBand(
          units.filter((unit) => unit.band === band),
          band,
        ),
      )
      .join(', '),
  }
}

function leadShareOfBand(units: readonly MinedOreUnit[], band: number): string {
  const [plus1, plus2] = [1, 2].map((lead) => units.filter((unit) => unit.lead === lead).length)
  return `b${band} ${plus1} / ${plus2} of ${units.length}`
}

function valuePerUnitRow(units: readonly MinedOreUnit[], planet: number): ReportRow {
  return {
    label: 'mean value per unit over V(t_b) by band (expected)',
    value: bandsMined(units)
      .map((band) =>
        valueRatioOfBand(
          units.filter((unit) => unit.band === band),
          planet,
          band,
        ),
      )
      .join(', '),
  }
}

function valueRatioOfBand(units: readonly MinedOreUnit[], planet: number, band: number): string {
  const total = units.map((unit) => unit.value).reduce(add)
  const base = mul(oreSalePrice(oreTier(planet, band)), fromSafeInteger(units.length))
  const expected = expectedValueRatio(planet, band)
  return `b${band} x${formatRatio(div(total, base))} (x${formatRatio(expected)})`
}

function leadTicksRow(units: readonly MinedOreUnit[], planet: number): ReportRow {
  const drilled = units.filter((unit) => unit.band === TICKS_BAND && unit.drillTicks > 0)
  return {
    label: `band ${TICKS_BAND} median drill ticks per tile by lead (H ratio)`,
    value: LEADS.map((lead) => leadTicksOf(drilled, planet, lead)).join(', '),
  }
}

function leadTicksOf(units: readonly MinedOreUnit[], planet: number, lead: number): string {
  const ticks = units.filter((unit) => unit.lead === lead).map((unit) => unit.drillTicks)
  const ratio = formatRatio(hardnessRatioOfLead(planet, TICKS_BAND, lead))
  return `+${lead} ${ticks.length === 0 ? '-' : medianOf(ticks)} (x${ratio})`
}

/** The bands any unit came from, shallowest first. */
function bandsMined(units: readonly MinedOreUnit[]): number[] {
  const bands = Array.from({ length: BAND_COUNT }, (_, at) => at + 1)
  return bands.filter((band) => units.some((unit) => unit.band === band))
}

/** The lower middle of an odd count's sort, the mean of the two middles rounded down otherwise. */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) >> 1
}

/** A ratio to three decimals, from an exact `Money` ratio. */
function formatRatio(ratio: Money): string {
  const perMille = toSafeInteger(roundToWhole(mul(ratio, fromSafeInteger(PER_MILLE))))
  return `${Math.floor(perMille / PER_MILLE)}.${String(perMille % PER_MILLE).padStart(3, '0')}`
}
