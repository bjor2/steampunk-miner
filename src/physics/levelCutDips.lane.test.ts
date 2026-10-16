import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CUT_FOLLOW_TICKS } from '../constants/balance'
import { MM_PER_METRE, PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { buildIntent } from '../systems/input/buildIntent'
import { createRig, type TickRead } from './cutFollowFixtures'

// Level-cut dips under 80% (ticket 505, measurement only, the TD's felt-drilling list row 3 and
// #459's table): the two level lines `cutSmoothness.test.ts` holds on `it.todo`, the 15 m/s rig
// (and rig-heavy) and the 25 and 44 m/s rigs, measured for depth, size and rate. Each rig plays
// that spec's script (off the pad 2 s, down, then level west) with the level leg long enough to
// drill at least 100 m, at 30 and 144 frames/s, and the down leg held 0 to 3 ticks longer so the
// level cut starts at another phase of a cell (the 15 m/s rig cuts at 11.46 m/s, 0.19 m a tick).
// At 30 frames/s the drive changes on a frame, every second tick, so phases come in pairs. On the
// level leg's ramped-up cut ticks (the #421 bar's own `isRampedCut`), a dip is a run of ticks
// under 80% of the rig's own cut speed. Per run it records the depth (the lowest speed in a dip
// as a share of the cut speed), the size (ticks under 80%, the longest dip, the largest change
// across a held cell boundary), the rate (dips per metre the level leg drilled, and per metre of judged ticks), what the body
// lost in the dips in mm and in px at 12 m (90 px/m at 1080p, 70 px/m at 390x844), and only what
// the tick trace shows of a cause: a dip tick that crossed a cell boundary, left the ground, or
// went backwards (a bounce off the face). It changes nothing; it prints the table and writes
// balance-report/level-cut-dips.ndjson. A lane: it runs only when named, and fails only when a
// run drills under 100 m of level cut or judges no ramped-up tick.

interface LevelRig {
  rig: string
  levels: Record<string, number>
  /** Seconds the level leg is held: 100 m at the rig's cut speed, with its ramp and margin. */
  levelSeconds: number
  /** Seconds the down leg is held before the cell phase's extra ticks. */
  downSeconds: number
}

const FIFTEEN_LEVELS = { drill_power: 200, drill_tip: 600, engine: 5000 }
const LEVEL_RIGS: readonly LevelRig[] = [
  { rig: '15 m/s', levels: FIFTEEN_LEVELS, levelSeconds: 10, downSeconds: 3 },
  {
    rig: 'rig-heavy 15 m/s',
    levels: { ...FIFTEEN_LEVELS, hull: 5000, cargo_hold: 5000 },
    levelSeconds: 10,
    downSeconds: 3,
  },
  {
    rig: '25 m/s',
    levels: { drill_power: 250, drill_tip: 600, engine: 5000 },
    levelSeconds: 6,
    downSeconds: 3,
  },
  {
    rig: '44 m/s (rig 1, #400)',
    levels: { drill_power: 300, drill_tip: 200 },
    levelSeconds: 4,
    downSeconds: 2,
  },
]
const FRAME_RATES = [30, 144]
/** Extra down-leg ticks, so the level cut starts at another phase of a cell. */
const CELL_PHASES = [0, 1, 2, 3]
/** `cutSmoothness.test.ts`'s #421 interim bar. */
const MIN_SPEED_SHARE = 0.8
const BACKWARDS_M_PER_S = -0.02
/** The ticket's window: dips per metre over at least this much level cut. */
const MIN_WINDOW_M = 100
/** Px a metre at 12 m of zoom: 1080p and a 390x844 phone (ticket 505). */
const PX_PER_M_DESKTOP = 90
const PX_PER_M_PHONE = 70
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 1_800_000

/** One run of consecutive ramped-up cut ticks under 80% of the cut speed. */
interface Dip {
  /** Index of the first tick on the level leg. */
  at: number
  ticks: number
  /** The lowest speed in the dip as a share of the cut speed. */
  lowestShare: number
  /** Distance the body fell short of the cut speed over the dip, mm. */
  lostMm: number
  crossesBoundary: boolean
  leavesGround: boolean
  goesBackwards: boolean
}

interface LevelRun {
  rig: string
  framesPerSecond: number
  cellPhase: number
  cutSpeed: number
  rampedTicks: number
  drilledM: number
  /** Metres the body moved over the ramped-up cut ticks the bar judges. */
  judgedM: number
  largestBoundaryChange: number
  dips: Dip[]
}

/** One rig at one frame rate over every cell phase, folded. */
interface LevelRow {
  rig: string
  framesPerSecond: number
  cutSpeed: number
  drilledM: number
  judgedM: number
  dips: number
  underTicks: number
  longestDipTicks: number
  /** The lowest share of the cut speed any dip reached; 1 with none. */
  deepestShare: number
  largestBoundaryChange: number
  dipsPerMetre: number
  dipsPerJudgedMetre: number
  worstLostMm: number
  worstLostPxDesktop: number
  worstLostPxPhone: number
  causes: { boundary: number; offGround: number; backwards: number }
}

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

const ticksOf = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)

/** Off the pad, down, then level west: `cutSmoothness.test.ts`'s script with a longer level leg. */
function playLevelLeg(rig: LevelRig, framesPerSecond: number, cellPhase: number): TickRead[] {
  const play = createRig(RAPIER, rig.levels, framesPerSecond)
  // The Sell bay is the pad's west end (#170), so off the pad is to the left.
  play.hold(buildIntent(['aim_left']), ticksOf(2))
  play.hold(buildIntent(['aim_down']), ticksOf(rig.downSeconds) + cellPhase)
  return play.hold(buildIntent(['aim_left']), ticksOf(rig.levelSeconds))
}

/** The ramp long done: cutting at one drill speed from `CUT_FOLLOW_TICKS` + 2 before to the next. */
function isRampedCut(ticks: readonly TickRead[], at: number): boolean {
  if (at < CUT_FOLLOW_TICKS + 2 || at + 1 >= ticks.length) return false
  const around = ticks.slice(at - CUT_FOLLOW_TICKS - 2, at + 2)
  const speed = ticks[at].read?.cutSpeed
  return around.every(({ result, read }) => result.isCutting && read?.cutSpeed === speed)
}

function isSameCell(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.floor(a.x) === Math.floor(b.x) && Math.floor(a.y) === Math.floor(b.y)
}

function crossesCell(ticks: readonly TickRead[], at: number): boolean {
  return at > 0 && !isSameCell(ticks[at - 1].position, ticks[at].position)
}

/** `cutSmoothness.test.ts`'s boundary line: the largest change across each held boundary. */
function largestBoundaryChangeOf(ticks: readonly TickRead[]): number {
  let largest = 0
  for (let at = 1; at + 1 < ticks.length; at++) {
    if (!isRampedCut(ticks, at) || !crossesCell(ticks, at)) continue
    const before = ticks[at - 1].speed
    const across = [ticks[at].speed, ticks[at + 1].speed]
    largest = Math.max(largest, ...across.map((speed) => Math.abs(speed - before) / before))
  }
  return largest
}

function isUnderBar(tick: TickRead): boolean {
  const cutSpeed = tick.read?.cutSpeed ?? 0
  return tick.speed < MIN_SPEED_SHARE * cutSpeed
}

/** The level leg's under-80% runs of ramped-up cut ticks. */
function dipsOf(ticks: readonly TickRead[]): Dip[] {
  const dips: Dip[] = []
  let open: number[] = []
  for (let at = 0; at < ticks.length; at++) {
    if (isRampedCut(ticks, at) && isUnderBar(ticks[at])) {
      open.push(at)
      continue
    }
    if (open.length > 0) dips.push(dipOf(ticks, open))
    open = []
  }
  if (open.length > 0) dips.push(dipOf(ticks, open))
  return dips
}

function dipOf(ticks: readonly TickRead[], at: readonly number[]): Dip {
  const dipTicks = at.map((index) => ticks[index])
  return {
    at: at[0],
    ticks: at.length,
    lowestShare: Math.min(...dipTicks.map(shareOfCutSpeed)),
    lostMm: dipTicks.reduce((sum, tick) => sum + lostMmOf(tick), 0),
    crossesBoundary: at.some((index) => crossesCell(ticks, index)),
    leavesGround: dipTicks.some(({ isOnGround }) => !isOnGround),
    goesBackwards: dipTicks.some(({ speed }) => speed < BACKWARDS_M_PER_S),
  }
}

function shareOfCutSpeed({ speed, read }: TickRead): number {
  return speed / (read?.cutSpeed ?? 1)
}

function lostMmOf({ speed, read }: TickRead): number {
  return ((read?.cutSpeed ?? 0) - speed) * PHYSICS_TIMESTEP * MM_PER_METRE
}

/** Metres the level leg moved along its facing. */
function drilledMetresOf(ticks: readonly TickRead[]): number {
  return ticks.reduce((sum, { speed }) => sum + speed * PHYSICS_TIMESTEP, 0)
}

/** Metres the level leg moved over its ramped-up cut ticks. */
function judgedMetresOf(ticks: readonly TickRead[]): number {
  return drilledMetresOf(ticks.filter((_, at) => isRampedCut(ticks, at)))
}

function rampedTickCountOf(ticks: readonly TickRead[]): number {
  return ticks.filter((_, at) => isRampedCut(ticks, at)).length
}

function cutSpeedOf(ticks: readonly TickRead[]): number {
  const ramped = ticks.find((_, at) => isRampedCut(ticks, at))
  return ramped?.read?.cutSpeed ?? 0
}

function measureRun(rig: LevelRig, framesPerSecond: number, cellPhase: number): LevelRun {
  const ticks = playLevelLeg(rig, framesPerSecond, cellPhase)
  return {
    rig: rig.rig,
    framesPerSecond,
    cellPhase,
    cutSpeed: cutSpeedOf(ticks),
    rampedTicks: rampedTickCountOf(ticks),
    drilledM: drilledMetresOf(ticks),
    judgedM: judgedMetresOf(ticks),
    largestBoundaryChange: largestBoundaryChangeOf(ticks),
    dips: dipsOf(ticks),
  }
}

function measureAllRuns(): LevelRun[] {
  return LEVEL_RIGS.flatMap((rig) =>
    FRAME_RATES.flatMap((framesPerSecond) =>
      CELL_PHASES.map((cellPhase) => measureRun(rig, framesPerSecond, cellPhase)),
    ),
  )
}

/** One rig's runs at one frame rate, over every cell phase. */
function foldRow(runs: readonly LevelRun[]): LevelRow {
  const dips = runs.flatMap((run) => run.dips)
  const drilledM = runs.reduce((sum, run) => sum + run.drilledM, 0)
  const judgedM = runs.reduce((sum, run) => sum + run.judgedM, 0)
  const worstLostMm = Math.max(0, ...dips.map(({ lostMm }) => lostMm))
  return {
    rig: runs[0].rig,
    framesPerSecond: runs[0].framesPerSecond,
    cutSpeed: runs[0].cutSpeed,
    drilledM,
    judgedM,
    dips: dips.length,
    underTicks: dips.reduce((sum, dip) => sum + dip.ticks, 0),
    longestDipTicks: Math.max(0, ...dips.map(({ ticks }) => ticks)),
    deepestShare: Math.min(1, ...dips.map(({ lowestShare }) => lowestShare)),
    largestBoundaryChange: Math.max(...runs.map((run) => run.largestBoundaryChange)),
    dipsPerMetre: dips.length / drilledM,
    dipsPerJudgedMetre: dips.length / judgedM,
    worstLostMm,
    worstLostPxDesktop: (worstLostMm / MM_PER_METRE) * PX_PER_M_DESKTOP,
    worstLostPxPhone: (worstLostMm / MM_PER_METRE) * PX_PER_M_PHONE,
    causes: causesOf(dips),
  }
}

function causesOf(dips: readonly Dip[]): LevelRow['causes'] {
  return {
    boundary: dips.filter((dip) => dip.crossesBoundary).length,
    offGround: dips.filter((dip) => dip.leavesGround).length,
    backwards: dips.filter((dip) => dip.goesBackwards).length,
  }
}

function rowsOf(runs: readonly LevelRun[]): LevelRow[] {
  return LEVEL_RIGS.flatMap(({ rig }) =>
    FRAME_RATES.map((framesPerSecond) =>
      foldRow(runs.filter((run) => run.rig === rig && run.framesPerSecond === framesPerSecond)),
    ),
  )
}

function formatRow(row: LevelRow): string {
  return [
    row.rig,
    row.framesPerSecond,
    row.cutSpeed.toFixed(2),
    `${row.drilledM.toFixed(1)} (${row.judgedM.toFixed(1)} judged)`,
    row.dips,
    row.underTicks,
    row.longestDipTicks,
    `${(row.deepestShare * 100).toFixed(1)}%`,
    row.largestBoundaryChange.toFixed(3),
    `${(row.dipsPerMetre * 100).toFixed(2)}/100 m (${(row.dipsPerJudgedMetre * 100).toFixed(2)} judged)`,
    row.worstLostMm.toFixed(0),
    `${row.worstLostPxDesktop.toFixed(1)}/${row.worstLostPxPhone.toFixed(1)}`,
    `${row.causes.boundary}/${row.causes.offGround}/${row.causes.backwards}`,
  ].join(' | ')
}

function formatTable(rows: readonly LevelRow[]): string {
  const header = [
    'rig | fps | cut m/s | level m (4 phases) | dips | ticks under 80% | longest dip',
    'deepest | largest boundary change | rate | worst dip mm lost | px at 12 m (1080p/phone)',
    'dips at a boundary/off ground/backwards',
  ].join(' | ')
  return [header, ...rows.map(formatRow)].join('\n')
}

function writeRuns(runs: readonly LevelRun[], rows: readonly LevelRow[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = [
    ...rows.map((row) => JSON.stringify({ ticket: 505, row })),
    ...runs.map((run) => JSON.stringify({ ticket: 505, run })),
  ]
  writeFileSync(new URL('level-cut-dips.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

describe('level-cut dips under 80% at 15, 25 and 44 m/s (ticket 505)', () => {
  let runs: LevelRun[] = []

  beforeAll(() => {
    runs = measureAllRuns()
    const rows = rowsOf(runs)
    console.log(formatTable(rows))
    writeRuns(runs, rows)
  }, RUN_TIMEOUT_MS)

  it('drills at least 100 m of level cut on every run', () => {
    const short = runs.filter(({ drilledM }) => drilledM < MIN_WINDOW_M)
    expect(
      short.map(({ rig, framesPerSecond, cellPhase }) => [rig, framesPerSecond, cellPhase]),
    ).toEqual([])
  })

  it('judges ramped-up cut ticks on every run', () => {
    const empty = runs.filter(({ rampedTicks }) => rampedTicks === 0)
    expect(
      empty.map(({ rig, framesPerSecond, cellPhase }) => [rig, framesPerSecond, cellPhase]),
    ).toEqual([])
  })
})
