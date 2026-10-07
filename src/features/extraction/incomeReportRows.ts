/**
 * The income items' row in the balance and session reports (#223 `reportRows`; #162 acceptance 4,
 * #201), derived from a run's `drain_yield` lines and never written into the log: per planet and
 * band, the largest value one trip moved, as a share of a full hold of that band's ore. The trip
 * cap holds it at or under 15% by construction; the Tester reads the median of the three pacing
 * seeds against that line.
 *
 * Each line's `tripCapFraction` is the trip's running share of its cap, and the cap is 15% of the
 * band's full hold, so the share of the band's ore is the fraction times that 15%.
 */
import type { ReportRow, ReportRowSource } from '../../logging/registries/reportRows'
import type { RunEvent } from '../../logging/runEvent'
import { formatPercent } from '../../systems/displayAmount'
import { cmp, fromCanonical, mul, type Money } from '../../systems/money'
import { BAND_COUNT } from '../../systems/world/planetGeometry'
import { DRAIN_YIELD_EVENT } from './logging'
import { EXTRACTION_ECONOMY } from './systems/extractionEconomy'
import { EXTRACTION_ITEMS } from './systems/extractionItems'

export const INCOME_REPORT_ROWS_ID = 'extraction.income-items'

/** The first planet an income item of this lane can be researched on. */
const FIRST_INCOME_PLANET = Math.min(...EXTRACTION_ITEMS.map((item) => item.node.unlockTier))

const BANDS = Array.from({ length: BAND_COUNT }, (_, index) => index + 1)

interface YieldLine {
  band: number
  tripCapFraction: string
}

export const incomeReportRows: ReportRowSource = {
  id: INCOME_REPORT_ROWS_ID,
  rowsOf: incomeRowsOf,
}

function incomeRowsOf(
  events: readonly RunEvent[],
  _worldSeed: number,
  planet: number,
): ReportRow[] {
  const lines = yieldLinesOn(events, planet)
  if (planet < FIRST_INCOME_PLANET && lines.length === 0) return []
  return [
    { label: 'income item uses', value: String(lines.length) },
    { label: 'income items per trip, share of band ore by band', value: sharesByBand(lines) },
  ]
}

function yieldLinesOn(events: readonly RunEvent[], planet: number): YieldLine[] {
  return events
    .filter((event) => event.planet === planet && isDrainYieldLine(event))
    .map((event) => event.data as unknown as YieldLine)
}

/** Slice names sit outside the kernel's name union, so the line is matched as text. */
function isDrainYieldLine({ event }: { event: string }): boolean {
  return event === DRAIN_YIELD_EVENT
}

/** `band 1 none, band 2 3.75%, ...`: every band, so a band with no use reads as none. */
function sharesByBand(lines: readonly YieldLine[]): string {
  return BANDS.map((band) => `band ${band} ${shareTextOf(largestShareIn(lines, band))}`).join(', ')
}

function largestShareIn(lines: readonly YieldLine[], band: number): Money | null {
  return lines
    .filter((line) => line.band === band)
    .map((line) => mul(fromCanonical(line.tripCapFraction), EXTRACTION_ECONOMY.income.tripCapShare))
    .reduce<Money | null>(largerOf, null)
}

function largerOf(largest: Money | null, share: Money): Money {
  return largest !== null && cmp(largest, share) >= 0 ? largest : share
}

function shareTextOf(share: Money | null): string {
  return share === null ? 'none' : formatPercent(share)
}
