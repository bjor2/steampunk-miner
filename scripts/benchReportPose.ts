/**
 * The authority's cost of a pose report every tick while the drill bites (ticket 514 scope 5, cost
 * gate final in the TD addendum 6225108027 on #514, with the Vertical Scaler's ruling). At the
 * shipped `DRILL_POSE_REPORT_INTERVAL_TICKS`, with `drill.exactCarry` on as it ships with:
 * - W = 7: tick p50 1.2 ms or less, an absolute bar;
 * - W = 27: tick p95 2 ms or less, or else no worse than 1.25x the flag-on swept cut's p95 timed
 *   beside it (same rig, width and stride, interleaved in the same run);
 * - P200 flatness: at W = 7 the P200 rig's p50 within 10% of the P1 rig's at the same speed, and
 *   at W = 27 the same 1.25x rule, so the cost follows the window, not the cells carved (about 430
 *   a tick at W = 7 and 3600 m/s).
 * Run on an idle box (the loop paused) with `npm run bench:report-pose:paired` (the swept rows
 * need `--paired`; `npm run bench:report-pose` times the reports alone); the quiet-bench runner
 * takes the median of three runs. `-- --log` writes `benchmark_result` lines (#124). Logged, not
 * gated here: `meetsBar` and `gates` (`bench/reportPoseBar.ts`) only name the reading. Interval 2
 * is not an option.
 *
 * The TD's probe method (section 2.6 of the shape's write-up): the rigs of `bench/reportPoseRigs.ts`
 * on a level cut on planet 1, W = 2 + the side cells of a bench-only drill-gear source, a leg timed
 * as `bench/reportPoseLegs.ts` drives it. The swept rows (`mode` `swept`) time `drillAlongStep` at
 * the same stride a tick (25 mm at 1.5 m/s, 117 mm at 7 m/s), interleaved rep by rep with the
 * report legs. At 3600 m/s the body crosses the cut in a tick, so only the every-tick cadences run.
 *
 * The command log's volume (Systems' ask on #441) is the reports' `commands.ndjson` bytes a second
 * while drilling, as the run log writes them (run-coded since #522). The cells a tick changed are
 * counted on a warm-up pass, never on a timed one.
 */
import { loadFeatures } from '../src/features'
import {
  DRILL_POSE_REPORT_INTERVAL_TICKS,
  POSE_REPORT_INTERVAL_TICKS,
} from '../src/constants/balance'
import { TICKS_PER_SECOND } from '../src/constants/physics'
import { loggedCommandsOf } from '../src/logging/commandLog'
import { withRegistrations } from '../src/registries/registrar'
import type { SliceDefinition } from '../src/registries/sliceDefinition'
import type { AuthorityCommand } from '../src/systems/authority/authorityCommand'
import { withDrillExactCarry } from '../src/systems/authority/cutCarryFixtures'
import { logBenchmarkSeriesWhenAsked } from './bench/benchRunLog'
import { p95OverSweptOf, REPORT_POSE_BAR, reportPoseGatesOf } from './bench/reportPoseBar'
import { driveLeg, passTicksOf, type Leg, type LegRun } from './bench/reportPoseLegs'
import {
  PLANET_1_RIG,
  PLANET_200_RIG,
  stateAtCutStart,
  type BenchRig,
} from './bench/reportPoseRigs'

loadFeatures()

const REPS = 3
const TICKS = 240
const WIDTHS = [
  { width: 7, sideCells: 5 },
  { width: 27, sideCells: 25 },
]
/** The probe's speeds, the stored-200 rig's 15 m/s body and the rigs' 60 m step bound. */
const SPEEDS_MPS = [1.5, 7, 15, 3600]
/** The paired mode: each cut also timed as the flag-on swept cut (TD addendum 6225108027). */
const isPaired = process.argv.includes('--paired')
/** Today's cadence, the shipped one and the steps between (the VS's fallback rule reads them). */
const INTERVALS = [POSE_REPORT_INTERVAL_TICKS, 3, 2, DRILL_POSE_REPORT_INTERVAL_TICKS]

/** A bench-only drill-gear source: `sideCells` cells on each side of the bore. */
function sideCellsSlice(sideCells: number): SliceDefinition {
  return {
    id: 'bench-gear',
    register: (r) => r.drillGear({ id: 'bench-gear.sides', gearOf: () => ({ sideCells }) }),
  }
}

/** Every leg of one rig, width and speed: the cadences a pass holds, and the swept baseline. */
function legsAt(rig: BenchRig, width: number, sideCells: number, speedMps: number): Leg[] {
  const at = { rig, width, sideCells, speedMps }
  const passTicks = passTicksOf(speedMps, TICKS)
  const reports = INTERVALS.filter((interval) => interval <= passTicks).map((interval): Leg => ({
    ...at,
    mode: 'report',
    interval,
  }))
  return isPaired ? [...reports, { ...at, mode: 'swept', interval: 1 }] : reports
}

/** The legs timed in turn, rep by rep, so load on the box falls on every leg alike. */
function benchInterleaved(legs: readonly Leg[]): LegRun[] {
  const start = stateAtCutStart(legs[0].rig)
  const warm = legs.map((leg) => driveLeg(leg, start, TICKS, true))
  const reps = Array.from({ length: REPS }, () =>
    legs.map((leg) => driveLeg(leg, start, TICKS, false)),
  )
  return legs.map((_, index) =>
    mergeRuns(
      warm[index],
      reps.map((rep) => rep[index]),
    ),
  )
}

function mergeRuns(warm: LegRun, timed: readonly LegRun[]): LegRun {
  return {
    reportMs: timed.flatMap((run) => run.reportMs),
    tickMs: timed.flatMap((run) => run.tickMs),
    reports: warm.reports,
    cellsPerTick: warm.cellsPerTick,
  }
}

function benchGroup(rig: BenchRig, width: number, sideCells: number, speedMps: number) {
  const legs = legsAt(rig, width, sideCells, speedMps)
  const runs = withRegistrations([sideCellsSlice(sideCells)], () => benchInterleaved(legs))
  return legs.map((leg, index) => ({ leg, run: runs[index] }))
}

function groupsOf(rig: BenchRig) {
  return WIDTHS.flatMap(({ width, sideCells }) =>
    SPEEDS_MPS.flatMap((speedMps) => benchGroup(rig, width, sideCells, speedMps)),
  )
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function mean(times: readonly number[]): number {
  return times.length === 0 ? 0 : times.reduce((total, ms) => total + ms, 0) / times.length
}

const round = (ms: number) => Number(ms.toFixed(3))

/** `commands.ndjson` bytes a second of the warm pass's reports, as the run log writes them. */
function logBytesPerSecond(reports: readonly AuthorityCommand[]): number {
  const lines = loggedCommandsOf(reports).map((line) => JSON.stringify(line) + '\n')
  const bytes = lines.reduce((total, line) => total + line.length, 0)
  return Math.round((bytes * TICKS_PER_SECOND) / TICKS)
}

function rowOf(leg: Leg, run: LegRun) {
  return {
    mode: leg.mode,
    planetLevel: leg.rig.planetLevel,
    width: leg.width,
    speedMps: leg.speedMps,
    interval: leg.interval,
    reportP50Ms: round(percentile(run.reportMs, 0.5)),
    reportP95Ms: round(percentile(run.reportMs, 0.95)),
    tickMeanMs: round(mean(run.tickMs)),
    tickP50Ms: round(percentile(run.tickMs, 0.5)),
    tickP95Ms: round(percentile(run.tickMs, 0.95)),
    tickMaxMs: round(Math.max(...run.tickMs)),
    reportsPerSecond: (run.reports.length * TICKS_PER_SECOND) / TICKS,
    logBytesPerSecond: logBytesPerSecond(run.reports),
    maxCellsPerTick: Math.max(0, ...run.cellsPerTick),
    meanCellsPerTick: round(mean(run.cellsPerTick)),
  }
}

type Row = ReturnType<typeof rowOf>

/** Each report row with its tail over the swept cut beside it (null unpaired). */
function withSweptRatios(rows: readonly Row[]) {
  return rows.map((row) => {
    const ratio = row.mode === 'report' ? p95OverSweptOf(rows, row) : null
    return { ...row, tickP95OverSwept: ratio === null ? null : round(ratio) }
  })
}

function seriesNameOf(leg: Leg): string {
  const cadence = leg.mode === 'swept' ? 'swept' : `every${leg.interval}`
  return `reportPose.p${leg.rig.planetLevel}.w${leg.width}.${leg.speedMps}mps.${cadence}`
}

// A report every tick ships only with the authority's exact carry on (TD 6236464931 on #514), so
// the report legs are timed with the charge they ship with.
const runs = withDrillExactCarry(true, () => [
  ...groupsOf(PLANET_1_RIG),
  ...groupsOf(PLANET_200_RIG),
])
const rows = withSweptRatios(runs.map(({ leg, run }) => rowOf(leg, run)))
const gates = reportPoseGatesOf(rows, DRILL_POSE_REPORT_INTERVAL_TICKS)
console.log(
  JSON.stringify({
    bench: 'reportPose',
    shippedInterval: DRILL_POSE_REPORT_INTERVAL_TICKS,
    isPaired,
    rows,
    bar: REPORT_POSE_BAR,
    gates,
    meetsBar: Object.values(gates).every(Boolean),
  }),
)
logBenchmarkSeriesWhenAsked(
  'report-pose',
  runs.map(({ leg, run }) => ({ name: seriesNameOf(leg), planet: 1, timesMs: run.tickMs })),
)
