/**
 * The authority's cost of a pose report every tick while the drill bites (ticket 514 scope 5, the
 * Vertical Scaler's bar in the TD shape on #441 6223171858): at the shipped
 * `DRILL_POSE_REPORT_INTERVAL_TICKS` the cost per tick is p50 0.7 ms or less at W = 7 and at
 * W = 27, and p95 under 2 ms at W = 27. Run on a quiet box with `npm run bench:report-pose`
 * (`-- --log` writes `benchmark_result` lines, #124). Logged, not gated here: if the shipped
 * interval misses the bar, the ticket goes back to the TD and the VS (a quiet choice of 2 is not
 * allowed), so `meetsBar` only names the reading.
 *
 * The TD's probe method (section 2.6 of the shape's write-up): a level cut on planet 1 at about
 * 279.5 m from the centre, as `benchDrillStep.ts`, with the drill far past the floor so every
 * sample the stamp reaches clears; W = 2 + the side cells of a bench-only drill-gear source. The
 * body moves at a steady 1.5 or 7 m/s and reports every `interval` ticks with that many drive and
 * drill ticks, as the live loop's reporter does. The clock is moved untimed before each report, so
 * the timed call is the report alone (its stamp, gear, charge and yield); a tick with no report
 * costs 0. Every report must be accepted: a `CommandRejected` stops the bench.
 *
 * The command log's volume (Systems' ask on #441) is the reports' `commands.ndjson` lines a
 * second while drilling. A steady scripted speed steps x by the same mm each report, so the live
 * loop's lines, which also carry a jittering velocity, are somewhat larger.
 */
import { loadFeatures } from '../src/features'
import {
  DRILL_POSE_REPORT_INTERVAL_TICKS,
  POSE_REPORT_INTERVAL_TICKS,
} from '../src/constants/balance'
import { MM_PER_METRE, TICKS_PER_SECOND } from '../src/constants/physics'
import { loggedCommandsOf } from '../src/logging/commandLog'
import { withRegistrations } from '../src/registries/registrar'
import type { SliceDefinition } from '../src/registries/sliceDefinition'
import { advanceTicks } from '../src/systems/authority/advanceTicks'
import { applyCommand } from '../src/systems/authority/applyCommand'
import type { AuthorityCommand, CommandIntent } from '../src/systems/authority/authorityCommand'
import type { AuthorityState } from '../src/systems/authority/authorityState'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  poseAbove,
} from '../src/systems/authority/scriptedSession'
import { FACING } from '../src/systems/vehicle/vehiclePose'
import { logBenchmarkSeriesWhenAsked } from './bench/benchRunLog'

loadFeatures()

const REPS = 3
const TICKS = 240
const BAR = { tickP50Ms: 0.7, wideTickP95Ms: 2 }
const START = { x: -10_000, y: 279_500 }
const FLOOR_BOUND = [
  { upgradeId: 'drill_power', level: 2000 },
  { upgradeId: 'drill_tip', level: 600 },
]
const WIDTHS = [
  { width: 7, sideCells: 5 },
  { width: 27, sideCells: 25 },
]
const SPEEDS_MPS = [1.5, 7]
/** Today's cadence, the shipped one and the steps between (the VS's fallback rule reads them). */
const INTERVALS = [POSE_REPORT_INTERVAL_TICKS, 3, 2, DRILL_POSE_REPORT_INTERVAL_TICKS]

/** A bench-only drill-gear source: `sideCells` cells on each side of the bore. */
function sideCellsSlice(sideCells: number): SliceDefinition {
  return {
    id: 'bench-gear',
    register: (r) => r.drillGear({ id: 'bench-gear.sides', gearOf: () => ({ sideCells }) }),
  }
}

interface Leg {
  speedMps: number
  interval: number
}

/** One run's timings: each report's, each tick's (0 with no report) and the reports sent. */
interface LegRun {
  reportMs: number[]
  tickMs: number[]
  reports: AuthorityCommand[]
}

function stateAtCutStart(): AuthorityState {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  for (const payload of FLOOR_BOUND) session.submit(0, { type: 'debug.setUpgrade', payload })
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '1000000' } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.right)
  session.submit(0, { type: 'reportPose', payload: { ...payload, ...START } })
  return session.state()
}

function reportAt(leg: Leg, tick: number): CommandIntent<'reportPose'> {
  const vx = Math.round(leg.speedMps * MM_PER_METRE)
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.right, { drillTicks: leg.interval })
  return {
    type: 'reportPose',
    payload: {
      ...payload,
      ...{ x: START.x + Math.round((vx * tick) / TICKS_PER_SECOND), y: START.y, vx },
      ...{ driving: true, drilling: true, driveTicks: leg.interval },
      drive: { x: 1, y: 0 },
    },
  }
}

function driveLeg(leg: Leg): LegRun {
  let state = stateAtCutStart()
  const run: LegRun = { reportMs: [], tickMs: [], reports: [] }
  for (let tick = 1; tick <= TICKS; tick++) {
    if (tick % leg.interval !== 0) {
      run.tickMs.push(0)
      continue
    }
    state = advanceTicks(state, tick).state
    const seq = state.players.p1.lastSeq + 1
    const command = { playerId: 'p1', tick, seq, ...reportAt(leg, tick) }
    const started = performance.now()
    const outcome = applyCommand(state, command)
    const ms = performance.now() - started
    refuseRejection(outcome.events, tick)
    state = outcome.state
    run.reportMs.push(ms)
    run.tickMs.push(ms)
    run.reports.push(command)
  }
  return run
}

function refuseRejection(events: readonly { type: string }[], tick: number): void {
  const rejected = events.find((event) => event.type === 'CommandRejected')
  if (rejected !== undefined) {
    throw new Error(`reportPose at tick ${tick} rejected: ${JSON.stringify(rejected)}`)
  }
}

function benchLeg(sideCells: number, leg: Leg): LegRun {
  return withRegistrations([sideCellsSlice(sideCells)], () => {
    driveLeg(leg)
    const runs = Array.from({ length: REPS }, () => driveLeg(leg))
    return {
      reportMs: runs.flatMap((run) => run.reportMs),
      tickMs: runs.flatMap((run) => run.tickMs),
      reports: runs[0].reports,
    }
  })
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function mean(times: readonly number[]): number {
  return times.reduce((total, ms) => total + ms, 0) / times.length
}

const round = (ms: number) => Number(ms.toFixed(3))

/** `commands.ndjson` bytes a second of one run's reports, as the run log writes them. */
function logBytesPerSecond(reports: readonly AuthorityCommand[]): number {
  const lines = loggedCommandsOf(reports).map((line) => JSON.stringify(line) + '\n')
  const bytes = lines.reduce((total, line) => total + line.length, 0)
  return Math.round((bytes * TICKS_PER_SECOND) / TICKS)
}

function rowOf(width: number, leg: Leg, run: LegRun) {
  return {
    width,
    ...leg,
    reportP50Ms: round(percentile(run.reportMs, 0.5)),
    reportP95Ms: round(percentile(run.reportMs, 0.95)),
    tickMeanMs: round(mean(run.tickMs)),
    tickP50Ms: round(percentile(run.tickMs, 0.5)),
    tickP95Ms: round(percentile(run.tickMs, 0.95)),
    reportsPerSecond: (run.reports.length * TICKS_PER_SECOND) / TICKS,
    logBytesPerSecond: logBytesPerSecond(run.reports),
  }
}

type Row = ReturnType<typeof rowOf>

/** The VS bar on the shipped interval's rows: p50 at every width, p95 at the widest. */
function meetsBar(rows: readonly Row[]): boolean {
  const shipped = rows.filter((row) => row.interval === DRILL_POSE_REPORT_INTERVAL_TICKS)
  return shipped.every(isRowWithinBar)
}

function isRowWithinBar(row: Row): boolean {
  const isWidest = row.width === Math.max(...WIDTHS.map(({ width }) => width))
  const isTailWithin = !isWidest || row.tickP95Ms < BAR.wideTickP95Ms
  return row.tickP50Ms <= BAR.tickP50Ms && isTailWithin
}

const legs = SPEEDS_MPS.flatMap((speedMps) =>
  INTERVALS.map((interval): Leg => ({ speedMps, interval })),
)
const runs = WIDTHS.flatMap(({ width, sideCells }) =>
  legs.map((leg) => ({ width, leg, run: benchLeg(sideCells, leg) })),
)
const rows = runs.map(({ width, leg, run }) => rowOf(width, leg, run))
console.log(
  JSON.stringify({
    bench: 'reportPose',
    shippedInterval: DRILL_POSE_REPORT_INTERVAL_TICKS,
    rows,
    bar: BAR,
    meetsBar: meetsBar(rows),
  }),
)
logBenchmarkSeriesWhenAsked(
  'report-pose',
  runs.map(({ width, leg, run }) => ({
    name: `reportPose.w${width}.${leg.speedMps}mps.every${leg.interval}`,
    planet: 1,
    timesMs: run.tickMs,
  })),
)
