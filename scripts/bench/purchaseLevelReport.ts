/**
 * The `bench:purchase-levels` row lines and table (ticket 840): each row's numbers with the
 * profile's CPU slowdown applied to every time, and the ticket's done-when judged per row:
 *
 * - tick cost flat with speed: the moving tick's p50 within +-10% of the L1 row's on the same
 *   planet and profile;
 * - never in unloaded ground: no frame with the rig's body or cut front in a chunk with no mesh;
 * - frame p95 within the docs/perf frame budget (16.7 ms) and the terrain's 2 ms (#4);
 * - at L20, the hazard strip populated every frame and the 1 s collapse warning shown every frame
 *   it is judged (GVD's feel bar); reported on the other levels, required only at L20.
 *
 * A failing row is a streaming or prefetch finding under #647, never a reason to clamp speed.
 */
import { TERRAIN_FRAME_BUDGET_MS } from '../../src/constants/scene'
import { TICKS_PER_SECOND } from '../../src/constants/physics'
import { metresPerSecondOfStep } from '../../src/systems/vehicle/cutSpeed'
import type { RowSamples } from './purchaseLevelRun'
import { viewRadiusOfProfile, type BenchRow } from './purchaseLevelRows'

/** The ticket's flatness band round the L1 row's tick cost. */
const TICK_FLAT_SHARE = 0.1
const FEEL_BAR_LEVEL = 'L20'
const REFUSALS_SHOWN = 3

export interface RowLine {
  bench: 'purchaseLevels'
  row: string
  planet: number
  level: string
  drillPower: number
  lawMetresPerSecond: number
  metresPerSecond: number
  profile: string
  profileSource: string
  viewRadiusM: number
  cpuSlowdown: number
  passes: number
  frames: number
  movingTicks: number
  tickMsP50: number
  tickMsP95: number
  frameMsP95: number
  frameBudgetMs: number
  terrainMsP95: number
  terrainBudgetMs: number
  chunkLoadsPerSecond: number
  buildsPerFrameMean: number
  buildsPerFrameMax: number
  rigAheadFrames: number
  rigAheadLongestFrames: number
  stripPopulatedFrames: number
  warningFramesJudged: number
  warningFramesShown: number
  refusals: number
  firstRefusals: string[]
  /** Filled by `judgeRowLines` once the L1 row of the planet and profile is known. */
  tickP50VsL1: number | null
  failures: string[]
}

export function rowLineOf(row: BenchRow, samples: RowSamples): RowLine {
  const { rig, profile } = row
  const slow = (ms: number) => rounded(ms * profile.cpuSlowdown)
  const frames = samples.frameMs.length
  const movingTicks = samples.movingTickMs.length
  return {
    bench: 'purchaseLevels',
    row: row.id,
    planet: rig.planet,
    level: rig.level,
    drillPower: rig.drillPower,
    lawMetresPerSecond: rounded(metresPerSecondOfStep(rig.lawStepMm)),
    metresPerSecond: rounded(metresPerSecondOfStep(averageOf(samples.movedMm, movingTicks))),
    profile: profile.name,
    profileSource: profile.source,
    viewRadiusM: rounded(viewRadiusOfProfile(profile)),
    cpuSlowdown: profile.cpuSlowdown,
    passes: samples.passes,
    frames,
    movingTicks,
    tickMsP50: slow(percentile(samples.movingTickMs, 0.5)),
    tickMsP95: slow(percentile(samples.movingTickMs, 0.95)),
    frameMsP95: slow(percentile(samples.frameMs, 0.95)),
    frameBudgetMs: profile.frameBudgetMs,
    terrainMsP95: slow(percentile(samples.terrainMs, 0.95)),
    terrainBudgetMs: TERRAIN_FRAME_BUDGET_MS,
    chunkLoadsPerSecond: rounded(averageOf(samples.generated * TICKS_PER_SECOND, frames)),
    buildsPerFrameMean: rounded(averageOf(sumOf(samples.builds), frames)),
    buildsPerFrameMax: Math.max(0, ...samples.builds),
    rigAheadFrames: samples.rigAheadFrames,
    rigAheadLongestFrames: samples.rigAheadLongestFrames,
    stripPopulatedFrames: samples.populatedFrames,
    warningFramesJudged: samples.warningFramesJudged,
    warningFramesShown: samples.warningFramesShown,
    refusals: samples.refusals.length,
    firstRefusals: [...new Set(samples.refusals)].slice(0, REFUSALS_SHOWN),
    tickP50VsL1: null,
    failures: [],
  }
}

/** Each row against the ticket's done-when, its tick read against its planet and profile's L1. */
export function judgeRowLines(lines: readonly RowLine[]): RowLine[] {
  return lines.map((line) => {
    const tickP50VsL1 = tickRatioToL1(lines, line)
    return { ...line, tickP50VsL1, failures: failuresOf(line, tickP50VsL1) }
  })
}

function tickRatioToL1(lines: readonly RowLine[], line: RowLine): number | null {
  const base = lines.find((other) => isL1Of(other, line))
  if (base === undefined || base.tickMsP50 === 0) return null
  return rounded(line.tickMsP50 / base.tickMsP50)
}

function isL1Of(other: RowLine, line: RowLine): boolean {
  return other.level === 'L1' && other.planet === line.planet && other.profile === line.profile
}

function failuresOf(line: RowLine, tickP50VsL1: number | null): string[] {
  const checks: [string, boolean][] = [
    ['tick not flat vs L1', tickP50VsL1 !== null && Math.abs(tickP50VsL1 - 1) > TICK_FLAT_SHARE],
    ['rig in unloaded ground', line.rigAheadFrames > 0],
    ['frame p95 over budget', line.frameMsP95 > line.frameBudgetMs],
    ['terrain p95 over budget', line.terrainMsP95 > line.terrainBudgetMs],
    ['strip not populated', line.level === FEEL_BAR_LEVEL && !isStripAlwaysPopulated(line)],
    ['collapse warning missing', line.level === FEEL_BAR_LEVEL && !isWarningAlwaysShown(line)],
    ['commands refused', line.refusals > 0],
  ]
  return checks.flatMap(([name, isFailing]) => (isFailing ? [name] : []))
}

function isStripAlwaysPopulated(line: RowLine): boolean {
  return line.stripPopulatedFrames === line.frames
}

function isWarningAlwaysShown(line: RowLine): boolean {
  return line.warningFramesJudged > 0 && line.warningFramesShown === line.warningFramesJudged
}

const TABLE_HEADER = [
  'row',
  'drill',
  'law m/s',
  'm/s',
  'ticks',
  'tick p50/p95 ms',
  'vs L1',
  'frame p95 ms',
  'terrain p95 ms',
  'loads/s',
  'builds/frame (max)',
  'rig ahead (longest)',
  'strip',
  'warning',
  'fails',
]

/** The table to post on the ticket, one row a line. */
export function markdownTableOf(lines: readonly RowLine[]): string {
  const rule = TABLE_HEADER.map(() => '---')
  return [TABLE_HEADER, rule, ...lines.map(tableCellsOf)]
    .map((cells) => `| ${cells.join(' | ')} |`)
    .join('\n')
}

function tableCellsOf(line: RowLine): string[] {
  return [
    line.row,
    String(line.drillPower),
    String(line.lawMetresPerSecond),
    String(line.metresPerSecond),
    String(line.movingTicks),
    `${line.tickMsP50} / ${line.tickMsP95}`,
    line.tickP50VsL1 === null ? '-' : `${line.tickP50VsL1}x`,
    String(line.frameMsP95),
    String(line.terrainMsP95),
    String(line.chunkLoadsPerSecond),
    `${line.buildsPerFrameMean} (${line.buildsPerFrameMax})`,
    `${line.rigAheadFrames} (${line.rigAheadLongestFrames})`,
    `${line.stripPopulatedFrames}/${line.frames}`,
    `${line.warningFramesShown}/${line.warningFramesJudged}`,
    line.failures.length === 0 ? 'none' : line.failures.join(', '),
  ]
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
}

function sumOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

function averageOf(total: number, count: number): number {
  return count === 0 ? 0 : total / count
}

function rounded(value: number): number {
  return Number(value.toFixed(3))
}
