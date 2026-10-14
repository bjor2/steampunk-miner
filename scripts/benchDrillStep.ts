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
 * `drillStep` under today's 24-tick floor, so these cut the same line through `drillAlongStep`.
 */
import { loadFeatures } from '../src/features'
import { DENSITY_CELL_UNITS, TERRAIN_EDIT_UNITS_PER_TICK } from '../src/constants/terrainBudget'
import { withRegistrations } from '../src/registries/registrar'
import type { SliceDefinition } from '../src/registries/sliceDefinition'
import type { AuthorityState } from '../src/systems/authority/authorityState'
import { vehicleOf } from '../src/systems/authority/authorityState'
import { drillAlongStep } from '../src/systems/authority/drillStepCut'
import { createScriptedSession, PARAMS, poseAbove } from '../src/systems/authority/scriptedSession'
import { stepBoundsAt } from '../src/systems/authority/stepBoundRead'
import { NO_DRIVE } from '../src/systems/vehicle/driveSigns'
import { FACING, noseTileOf, type VehiclePose } from '../src/systems/vehicle/vehiclePose'
import { cellDensitySum } from '../src/systems/world/cellYield'
import { logBenchmarkSeriesWhenAsked } from './bench/benchRunLog'

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
  { upgradeId: 'drill_power', level: 2000 },
  { upgradeId: 'drill_tip', level: 600 },
]

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

function cutLevel(): StepRun {
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
    const started = performance.now()
    session.submit(tick, { type: 'drillStep', payload: { x, y: START.y, drive: NO_DRIVE } })
    run.timesMs.push(performance.now() - started)
    run.cellsPerTick.push(cellsChanged(before, session.state(), x))
  }
  return run
}

/** Cells within 4 m of the body whose density the step changed. */
function cellsChanged(before: AuthorityState, after: AuthorityState, xMm: number): number {
  let changed = 0
  const tx0 = Math.floor(xMm / 1000)
  const ty0 = Math.floor(START.y / 1000)
  for (let ty = ty0 - 4; ty <= ty0 + 4; ty++) {
    for (let tx = tx0 - 4; tx <= tx0 + 4; tx++) {
      const tile = { tx, ty }
      const isChanged =
        cellDensitySum(before.world, PARAMS, tile) !== cellDensitySum(after.world, PARAMS, tile)
      if (isChanged) changed++
    }
  }
  return changed
}

function benchAtWidth(sideCells: number): StepRun {
  return withRegistrations([sideCellsSlice(sideCells)], () => {
    cutLevel()
    const runs = Array.from({ length: REPS }, cutLevel)
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

/** `STEPS` ticks of a level cut `strideMm` a tick long, each timed through `drillAlongStep`. */
function cutAtStride(strideMm: number): number[] {
  const session = createScriptedSession()
  for (const payload of FLOOR_BOUND) session.submit(0, { type: 'debug.setUpgrade', payload })
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '1000000' } })
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.right)
  session.submit(0, { type: 'reportPose', payload: { ...payload, ...START } })
  let state = session.state()
  const timesMs: number[] = []
  for (let tick = 1; tick <= STEPS; tick++) {
    const reported = vehicleOf(state, 'p1').pose as VehiclePose
    const pose = { ...reported, x: START.x + strideMm * tick }
    const step = { pose, drive: NO_DRIVE, isLifting: false }
    const started = performance.now()
    state = drillAlongStep({ ...state, tick }, PARAMS, 'p1', noseTileOf(pose), step).state
    timesMs.push(performance.now() - started)
  }
  return timesMs
}

function benchAtStride(strideMm: number): number[] {
  cutAtStride(strideMm)
  return Array.from({ length: REPS }, () => cutAtStride(strideMm)).flat()
}

const bare = benchAtWidth(0)
const wide = benchAtWidth(5)
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
    atBudget: atBudget.map(({ strideMm, timesMs }) => ({
      strideMm,
      stepP50Ms: round(percentile(timesMs, 0.5)),
      stepP95Ms: round(percentile(timesMs, 0.95)),
    })),
    budget: BUDGET,
  }),
)
logBenchmarkSeriesWhenAsked('drill-step', [
  { name: 'drillStep.bare', planet: 1, timesMs: bare.timesMs },
  { name: 'drillStep.w7', planet: 1, timesMs: wide.timesMs },
  ...atBudget.map(({ strideMm, timesMs }) => ({
    name: `drillStep.stride${strideMm}`,
    planet: 1,
    timesMs,
  })),
])
