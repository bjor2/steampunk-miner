/**
 * The cost gate `benchReportPose.ts` reads its rows against (ticket 514, TD addendum 6225108027 on
 * #514 with the Vertical Scaler's ruling): at the shipped interval, W = 7 tick p50 1.2 ms or less
 * on every ground; W = 27 tick p95 2 ms or less, or no worse than 1.25x the swept cut timed beside
 * it; on planet 200, W = 7 p50 within 10% of planet 1's at the same speed and W = 27 the same tail
 * rule. A gate with no row to judge reads false, never true.
 */
export const REPORT_POSE_BAR = {
  tickP50Ms: 1.2,
  wideTickP95Ms: 2,
  sweptRatio: 1.25,
  flatShare: 0.1,
}
const NARROW = 7
const WIDE = 27

/** The fields of a bench row the gate reads. */
export interface GatedRow {
  mode: 'report' | 'swept'
  planetLevel: number
  width: number
  speedMps: number
  interval: number
  tickP50Ms: number
  tickP95Ms: number
}

export function reportPoseGatesOf(rows: readonly GatedRow[], shippedInterval: number) {
  const shipped = rows.filter((row) => row.mode === 'report' && row.interval === shippedInterval)
  const narrow = shipped.filter((row) => row.width === NARROW)
  const wideOn = (planetLevel: number) =>
    shipped.filter((row) => row.width === WIDE && row.planetLevel === planetLevel)
  return {
    narrowP50: isEveryRow(narrow, isNarrowWithin),
    wideP95: isEveryRow(wideOn(1), (row) => isWideTailWithin(rows, row)),
    planet200NarrowFlat: isEveryRow(narrowOn(narrow, 200), (row) => isFlatOnPlanet1(narrow, row)),
    planet200WideP95: isEveryRow(wideOn(200), (row) => isWideTailWithin(rows, row)),
  }
}

/** The ratio a report row's tail runs at over the swept cut beside it, for the table. */
export function p95OverSweptOf(rows: readonly GatedRow[], row: GatedRow): number | null {
  const swept = sweptBeside(rows, row)
  return swept === undefined || swept.tickP95Ms === 0 ? null : row.tickP95Ms / swept.tickP95Ms
}

function isEveryRow(rows: readonly GatedRow[], isWithin: (row: GatedRow) => boolean): boolean {
  return rows.length > 0 && rows.every(isWithin)
}

function narrowOn(narrow: readonly GatedRow[], planetLevel: number): GatedRow[] {
  return narrow.filter((row) => row.planetLevel === planetLevel)
}

function isNarrowWithin(row: GatedRow): boolean {
  return row.tickP50Ms <= REPORT_POSE_BAR.tickP50Ms
}

/** W = 27's tail: under 2 ms, or no worse than 1.25x the swept cut beside it. */
function isWideTailWithin(rows: readonly GatedRow[], row: GatedRow): boolean {
  if (row.tickP95Ms <= REPORT_POSE_BAR.wideTickP95Ms) return true
  const ratio = p95OverSweptOf(rows, row)
  return ratio !== null && ratio <= REPORT_POSE_BAR.sweptRatio
}

/** The swept row beside a report row: the same ground, width and speed. */
function sweptBeside(rows: readonly GatedRow[], row: GatedRow): GatedRow | undefined {
  return rows.find((other) => other.mode === 'swept' && isSameCut(other, row))
}

function isSameCut(a: GatedRow, b: GatedRow): boolean {
  return a.planetLevel === b.planetLevel && a.width === b.width && a.speedMps === b.speedMps
}

/** A planet-200 W = 7 row's p50 against planet 1's at its speed. */
function isFlatOnPlanet1(narrow: readonly GatedRow[], row: GatedRow): boolean {
  const planet1 = narrowOn(narrow, 1).find((other) => other.speedMps === row.speedMps)
  if (planet1 === undefined) return false
  const drift = Math.abs(row.tickP50Ms - planet1.tickP50Ms)
  return drift <= planet1.tickP50Ms * REPORT_POSE_BAR.flatShare
}
