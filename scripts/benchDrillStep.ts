/**
 * The swept cut's budget (TD scope on #316, ticket 330 acceptance): one `drillStep`, its cut
 * included, costs p50 0.7 ms or less a tick at W = 7 (the bare bore's 2 cells a metre plus 5 side
 * cells), and no tick touches more than 32 density cells (`TERRAIN_EDIT_UNITS_PER_TICK`). Measured
 * and logged here, not gated: p95 is judged on the reference machine. Run with
 * `npm run bench:drill-step` (`-- --log` writes `benchmark_result` lines, #124).
 *
 * A level cut on planet 1 at about 279.5 m from the centre, as the #316 bench, at the rig's cutting
 * step bound (ticket 334: the drill law's step plus one 250 mm sample) with the drill far past the floor, so every sample it reaches clears. W comes
 * from a bench-only drill-gear source, as the TD's runs did. Each step is timed through
 * `applyCommand`; the cells it touched are counted afterwards from the densities.
 *
 * Ticket 335: one tick's cut at the per-cell budget and past it, p50 2 ms or less. A step 8 m
 * long touches about 19 cells (the per-cell walk) and one 16 m long about 35 (over the 32-cell
 * budget, so the swept span), as the TD's #316 table has them; neither speed is reachable through
 * `drillStep` under the 4-tick tile floor (ticket 396), so these cut the same line through
 * `drillAlongStep`.
 *
 * Ticket 560: every read takes the session's own params (`planetParamsOf(state.planet)`); the
 * legacy params of planet 1 (no ore rules stamp) took the one planet chunk cache from the
 * authority, so each step regenerated its chunks and read about 2.5 to 3 ms high.
 *
 * Ticket 620 (the TD shape on #308): `-- --width-ladder` adds the side cutters' widths, s = 0 to 3
 * side cells a side (W = 2 + s), each cut at 84, 840 and 8400 m/s through `drillAlongStep`, p50
 * and p95 logged per row. Logged, never gated here: a width that fails the TD's bar goes back to
 * the TD and the VS, never to a clamp on width (that would be a speed cap).
 *
 * Ticket 420: the W = 7 cut again with each step logged as the game logs it, the drill span writer
 * on (`w7Logged`); its p50 must stay within noise of the bare `wide` row, since a span only adds to
 * a fixed accumulator a tick.
 */
import { loadFeatures } from '../src/features'
import { recordDomainEventsTo } from '../src/logging/domainEventLog'
import { createMemorySink } from '../src/logging/eventSink'
import { createRunLog } from '../src/logging/runLog'
import { DENSITY_CELL_UNITS, TERRAIN_EDIT_UNITS_PER_TICK } from '../src/constants/terrainBudget'
import { TICKS_PER_SECOND } from '../src/constants/physics'
import { withRegistrations } from '../src/registries/registrar'
import type { SliceDefinition } from '../src/registries/sliceDefinition'
import type { AuthorityCommand } from '../src/systems/authority/authorityCommand'
import type { AuthorityState } from '../src/systems/authority/authorityState'
import type { DomainEvent } from '../src/systems/authority/domainEvent'
import { vehicleOf } from '../src/systems/authority/authorityState'
import { drillAlongStep } from '../src/systems/authority/drillStepCut'
import { planetParamsOf } from '../src/systems/authority/planetOfState'
import { createScriptedSession, poseAbove } from '../src/systems/authority/scriptedSession'
import { stepBoundsAt } from '../src/systems/authority/stepBoundRead'
import { NO_DRIVE } from '../src/systems/vehicle/driveSigns'
import { FACING, noseTileOf, type VehiclePose } from '../src/systems/vehicle/vehiclePose'
import { cellDensitySum } from '../src/systems/world/cellYield'
import type { PlanetParams } from '../src/systems/world/planetParams'
import { logBenchmarkSeriesWhenAsked } from './bench/benchRunLog'
import { CUT_LENGTH_MM } from './bench/reportPoseRigs'
import { devFlagSetLine } from '../src/logging/devFlagReport'

loadFeatures()

const REPS = 3
const STEPS = 60
const BUDGET = {
  stepP50Ms: 0.7,
  cellsPerTick: TERRAIN_EDIT_UNITS_PER_TICK / DENSITY_CELL_UNITS,
  atBudgetP50Ms: 2,
}
/** At the per-cell budget (about 19 cells, the walk) and past it (about 35, the span), mm a tick. */
const AT_BUDGET_STEPS_MM = [8_000, 16_000]
const START = { x: -10_000, y: 279_500 }
const FLOOR_BOUND = [
  { upgradeId: 'drill_power', level: 106 },
  { upgradeId: 'drill_tip', level: 600 },
]

/** Ticket 620's ladder: the side cutters' widths at the TD's three speeds, on `--width-ladder`. */
const isWidthLadder = process.argv.includes('--width-ladder')
const LADDER_SIDE_CELLS = [0, 1, 2, 3]
const LADDER_SPEEDS_MPS = [84, 840, 8400]

/** A bench-only drill-gear source: `sideCells` cells on each side of the bore. */
function sideCellsSlice(sideCells: number): SliceDefinition {
  return {
    id: 'bench-gear',
    register: (r) => r.drillGear({ id: 'bench-gear.sides', gearOf: () => ({ sideCells }) }),
  }
}

interface StepRun {
  timesMs: number[]
  cellsPerTick: number[]
  stepMm: number
}

/** What a timed step does besides the cut: nothing, or log itself as the game does. */
type LogStep = (
  command: AuthorityCommand,
  events: readonly DomainEvent[],
  after: AuthorityState,
) => void

const LOG_NOTHING: LogStep = () => undefined

/** A run log with the drill span writer on, as the game's (ticket 420). */
function logIntoRunLog(): LogStep {
  const runLog = createRunLog({
    runId: 'run_bench',
    sink: createMemorySink(),
    secondsSinceStart: () => 0,
  })
  const place = { playerId: 'p1', planet: 1, depthTiles: 20 }
  return (command, events, after) => {
    runLog.recordCommand(command)
    recordDomainEventsTo(runLog, place, events, after)
  }
}

function cutLevel(logStep: LogStep = LOG_NOTHING): StepRun {
  const session = createScriptedSession()
  for (const payload of FLOOR_BOUND) session.submit(0, { type: 'debug.setUpgrade', payload })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.right)
  session.submit(0, { type: 'reportPose', payload: { ...payload, ...START } })
  const stepMm = stepBoundsAt(session.state(), 'p1').cuttingMm
  const run: StepRun = { timesMs: [], cellsPerTick: [], stepMm }
  for (let tick = 1; tick <= STEPS; tick++) {
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    const x = START.x + stepMm * tick
    const before = session.state()
    const intent = {
      type: 'drillStep',
      payload: { x, y: START.y, facing: FACING.right, drive: NO_DRIVE },
    } as const
    const command = { playerId: 'p1', tick, seq: before.players.p1.lastSeq + 1, ...intent }
    const started = performance.now()
    logStep(command, session.submit(tick, intent), session.state())
    run.timesMs.push(performance.now() - started)
    run.cellsPerTick.push(cellsChanged(before, session.state(), x))
  }
  return run
}

/** The params the session's planet generates from: the authority's own, so the chunk cache holds. */
function paramsOfSession(state: AuthorityState): PlanetParams {
  return planetParamsOf(state.planet) as PlanetParams
}

/** Cells within 4 m of the body whose density the step changed. */
function cellsChanged(before: AuthorityState, after: AuthorityState, xMm: number): number {
  const params = paramsOfSession(before)
  let changed = 0
  const tx0 = Math.floor(xMm / 1000)
  const ty0 = Math.floor(START.y / 1000)
  for (let ty = ty0 - 4; ty <= ty0 + 4; ty++) {
    for (let tx = tx0 - 4; tx <= tx0 + 4; tx++) {
      const tile = { tx, ty }
      const isChanged =
        cellDensitySum(before.world, params, tile) !== cellDensitySum(after.world, params, tile)
      if (isChanged) changed++
    }
  }
  return changed
}

function benchAtWidth(sideCells: number, logStepOf: () => LogStep = () => LOG_NOTHING): StepRun {
  return withRegistrations([sideCellsSlice(sideCells)], () => {
    cutLevel(logStepOf())
    const runs = Array.from({ length: REPS }, () => cutLevel(logStepOf()))
    return {
      timesMs: runs.flatMap((run) => run.timesMs),
      cellsPerTick: runs.flatMap((run) => run.cellsPerTick),
      stepMm: runs[0].stepMm,
    }
  })
}

function percentile(times: readonly number[], fraction: number): number {
  const sorted = [...times].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

const round = (ms: number) => Number(ms.toFixed(3))

function reportOf(width: number, run: StepRun) {
  return {
    width,
    stepP50Ms: round(percentile(run.timesMs, 0.5)),
    stepP95Ms: round(percentile(run.timesMs, 0.95)),
    maxCellsPerTick: Math.max(...run.cellsPerTick),
  }
}

/** `steps` ticks of a level cut `strideMm` a tick long, each timed through `drillAlongStep`. */
function cutAtStride(strideMm: number, steps: number = STEPS): number[] {
  const session = createScriptedSession()
  for (const payload of FLOOR_BOUND) session.submit(0, { type: 'debug.setUpgrade', payload })
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '1000000' } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.right)
  session.submit(0, { type: 'reportPose', payload: { ...payload, ...START } })
  let state = session.state()
  const params = paramsOfSession(state)
  const timesMs: number[] = []
  for (let tick = 1; tick <= steps; tick++) {
    const reported = vehicleOf(state, 'p1').pose as VehiclePose
    const pose = { ...reported, x: START.x + strideMm * tick }
    const step = { pose, drive: NO_DRIVE, isLifting: false }
    const started = performance.now()
    state = drillAlongStep({ ...state, tick }, params, 'p1', noseTileOf(pose), step).state
    timesMs.push(performance.now() - started)
  }
  return timesMs
}

function benchAtStride(strideMm: number): number[] {
  cutAtStride(strideMm)
  return Array.from({ length: REPS }, () => cutAtStride(strideMm)).flat()
}

/**
 * `STEPS` ticks at `strideMm` in passes from a fresh cut, each pass as long as the line stays under
 * ground (`CUT_LENGTH_MM`), so a fast stride never times ticks cutting past the planet's edge.
 */
function cutInPassesAt(strideMm: number): number[] {
  const passTicks = Math.max(1, Math.min(STEPS, Math.floor(CUT_LENGTH_MM / strideMm)))
  const passes = Math.ceil(STEPS / passTicks)
  return Array.from({ length: passes }, () => cutAtStride(strideMm, passTicks)).flat()
}

/** One ladder row: `sideCells` a side cut at `speedMps`, its stride a tick in whole mm. */
function benchLadderRow(sideCells: number, speedMps: number) {
  const strideMm = Math.round((speedMps * 1000) / TICKS_PER_SECOND)
  const timesMs = withRegistrations([sideCellsSlice(sideCells)], () => {
    cutInPassesAt(strideMm)
    return Array.from({ length: REPS }, () => cutInPassesAt(strideMm)).flat()
  })
  return { width: 2 + sideCells, sideCells, speedMps, strideMm, timesMs }
}

const ladder = isWidthLadder
  ? LADDER_SIDE_CELLS.flatMap((sideCells) =>
      LADDER_SPEEDS_MPS.map((speedMps) => benchLadderRow(sideCells, speedMps)),
    )
  : []
const bare = benchAtWidth(0)
const wide = benchAtWidth(5)
const wideLogged = benchAtWidth(5, logIntoRunLog)
const atBudget = AT_BUDGET_STEPS_MM.map((strideMm) => ({
  strideMm,
  timesMs: benchAtStride(strideMm),
}))
console.log(
  JSON.stringify({
    bench: 'drillStep',
    stepMm: bare.stepMm,
    bare: reportOf(2, bare),
    wide: reportOf(7, wide),
    w7Logged: reportOf(7, wideLogged),
    atBudget: atBudget.map(({ strideMm, timesMs }) => ({
      strideMm,
      stepP50Ms: round(percentile(timesMs, 0.5)),
      stepP95Ms: round(percentile(timesMs, 0.95)),
    })),
    budget: BUDGET,
    widthLadder: ladder.map(({ timesMs, ...row }) => ({
      ...row,
      stepP50Ms: round(percentile(timesMs, 0.5)),
      stepP95Ms: round(percentile(timesMs, 0.95)),
    })),
  }),
)
logBenchmarkSeriesWhenAsked('drill-step', [
  { name: 'drillStep.bare', planet: 1, timesMs: bare.timesMs },
  { name: 'drillStep.w7', planet: 1, timesMs: wide.timesMs },
  { name: 'drillStep.w7Logged', planet: 1, timesMs: wideLogged.timesMs },
  ...atBudget.map(({ strideMm, timesMs }) => ({
    name: `drillStep.stride${strideMm}`,
    planet: 1,
    timesMs,
  })),
  ...ladder.map(({ width, speedMps, timesMs }) => ({
    name: `drillStep.w${width}.${speedMps}mps`,
    planet: 1,
    timesMs,
  })),
])

// The flag set the bench ran with (ticket 547): every bench report prints it.
console.log(devFlagSetLine([]))
