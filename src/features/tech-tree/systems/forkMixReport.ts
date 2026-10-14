/**
 * `balance:forks` judged and printed (GD lock on #255, ticket 267): each fork pair's branches on
 * the pacing seeds, held to the pace pins (`forkPace.ts`) and told apart by their lane's action-mix
 * metric (`forkMixMetrics.ts`) on the median of the seeds (#84). The misses are listed by pin, so a
 * lane gate names the branch and the number; the table prints every run and every branch median,
 * P3 to P10 from arrival to core, with the metric's parts as the action-mix rows.
 */
import {
  doBranchesDiffer,
  forkMixMetricOf,
  formatForkMixValue,
  type ForkMixPart,
} from './forkMixMetrics'
import {
  areSliceMediansClose,
  FORK_PACE_PINS,
  forkPaceVerdictOf,
  medianTicks,
  minutesOfTicks,
  type ForkPace,
  type ForkPaceVerdict,
} from './forkPace'
import { TECH_LANES, type TechLane } from './techNode'

/** The planets the report prints, arrival to core: the lock's P3-P10. */
export const FORK_REPORT_PLANETS: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 10]

/** What the lane keeps of one forced run; the run itself is let go. */
export interface ForkSeedRun {
  lane: TechLane
  branch: string
  worldSeed: number
  pace: ForkPace
  /** Arrival to core on each of `FORK_REPORT_PLANETS`, null for never. */
  planetTicks: readonly (number | null)[]
  /** The lane metric's parts, in part order. */
  mixValues: readonly number[]
}

export interface ForkBranchVerdict extends ForkPaceVerdict {
  mixMedians: readonly number[]
}

export interface ForkPairVerdict {
  lane: TechLane
  branches: readonly ForkBranchVerdict[]
  areSliceMediansClose: boolean
  doesMixDiffer: boolean
}

/** Every lane with runs, in lane order, its branches in the order they were played. */
export function forkPairVerdictsOf(runs: readonly ForkSeedRun[]): ForkPairVerdict[] {
  return TECH_LANES.flatMap((lane) => {
    const laneRuns = runs.filter((run) => run.lane === lane)
    return laneRuns.length === 0 ? [] : [pairVerdictOf(lane, laneRuns)]
  })
}

/** The branches whose planet 8 median is under 45 minutes, or never. */
export function planetFloorMissesOf(verdicts: readonly ForkPairVerdict[]): string[] {
  return branchesOf(verdicts)
    .filter((branch) => !branch.isPlanetSlowEnough)
    .map(
      (branch) =>
        `${branch.branch} P${FORK_PACE_PINS.planet} ${minutesOfTicks(branch.medianPlanetTicks)}`,
    )
}

/** The branches whose slice median is outside 100-110 minutes. */
export function sliceBandMissesOf(verdicts: readonly ForkPairVerdict[]): string[] {
  return branchesOf(verdicts)
    .filter((branch) => !branch.isSliceInBand)
    .map((branch) => `${branch.branch} slice ${minutesOfTicks(branch.medianSliceTicks)}`)
}

/** The pairs whose two slice medians are more than 10% apart. */
export function sliceSpreadMissesOf(verdicts: readonly ForkPairVerdict[]): string[] {
  return verdicts.filter((pair) => !pair.areSliceMediansClose).map(slicesLineOf)
}

/** The pairs whose branches read the same metric: they differ only in stats. */
export function sameMixPairsOf(verdicts: readonly ForkPairVerdict[]): string[] {
  return verdicts.filter((pair) => !pair.doesMixDiffer).map(mixLineOf)
}

export function formatForkReport(
  runs: readonly ForkSeedRun[],
  verdicts: readonly ForkPairVerdict[],
): string {
  return [
    `## balance:forks: the pacing bot forced onto each fork branch, to planet 10's core`,
    tableHeaderOf(),
    ...runs.map(runRowOf),
    ...verdicts.flatMap(medianRowsOf),
  ].join('\n')
}

function pairVerdictOf(lane: TechLane, runs: readonly ForkSeedRun[]): ForkPairVerdict {
  const branches = branchNamesOf(runs).map((branch) =>
    branchVerdictOf(
      branch,
      runs.filter((run) => run.branch === branch),
    ),
  )
  const [first, second] = branches
  return {
    lane,
    branches,
    areSliceMediansClose: second !== undefined && areSliceMediansClose(first, second),
    doesMixDiffer: second !== undefined && doBranchesDiffer(first.mixMedians, second.mixMedians),
  }
}

function branchNamesOf(runs: readonly ForkSeedRun[]): string[] {
  return [...new Set(runs.map((run) => run.branch))]
}

function branchVerdictOf(branch: string, runs: readonly ForkSeedRun[]): ForkBranchVerdict {
  const pace = forkPaceVerdictOf(
    branch,
    runs.map((run) => run.pace),
  )
  return { ...pace, mixMedians: partMediansOf(runs) }
}

/** Each part's median over the seeds. */
function partMediansOf(runs: readonly ForkSeedRun[]): number[] {
  const parts = runs[0]?.mixValues.length ?? 0
  return Array.from(
    { length: parts },
    (_, at) => medianTicks(runs.map((run) => run.mixValues[at])) ?? 0,
  )
}

function branchesOf(verdicts: readonly ForkPairVerdict[]): ForkBranchVerdict[] {
  return verdicts.flatMap((pair) => [...pair.branches])
}

function slicesLineOf(pair: ForkPairVerdict): string {
  const slices = pair.branches.map(
    (branch) => `${branch.branch} ${minutesOfTicks(branch.medianSliceTicks)}`,
  )
  return `${pair.lane}: slice ${slices.join(' vs ')}`
}

function mixLineOf(pair: ForkPairVerdict): string {
  const values = pair.branches.map(
    (branch) => `${branch.branch} ${mixTextOf(pair.lane, branch.mixMedians)}`,
  )
  return `${pair.lane}: ${values.join(' vs ')}`
}

function tableHeaderOf(): string {
  const planets = FORK_REPORT_PLANETS.map((planet) => `P${planet}`)
  const header = ['lane', 'branch', 'seed', 'slice', ...planets, 'action mix']
  return `| ${header.join(' | ')} |\n|${header.map(() => ' --- |').join('')}`
}

function runRowOf(run: ForkSeedRun): string {
  const planets = run.planetTicks.map(minutesOfTicks)
  const cells = [run.lane, run.branch, String(run.worldSeed), minutesOfTicks(run.pace.sliceTicks)]
  return rowOf([...cells, ...planets, mixTextOf(run.lane, run.mixValues)])
}

function medianRowsOf(pair: ForkPairVerdict): string[] {
  return pair.branches.map((branch) => {
    const planets = FORK_REPORT_PLANETS.map((planet) =>
      planet === FORK_PACE_PINS.planet ? minutesOfTicks(branch.medianPlanetTicks) : '',
    )
    const slice = minutesOfTicks(branch.medianSliceTicks)
    const mix = mixTextOf(pair.lane, branch.mixMedians)
    return rowOf([`**${pair.lane}**`, `**${branch.branch}**`, 'median', slice, ...planets, mix])
  })
}

function rowOf(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`
}

/** The parts as `label value`, joined; the lane's metric names them. */
function mixTextOf(lane: TechLane, values: readonly number[]): string {
  const parts = forkMixMetricOf(lane)?.parts ?? []
  return parts.map((part, at) => partTextOf(part, values[at] ?? 0)).join('; ')
}

function partTextOf(part: ForkMixPart, value: number): string {
  return `${part.label} ${formatForkMixValue(part.unit, value)}`
}
