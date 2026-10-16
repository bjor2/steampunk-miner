import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../constants/physics'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { buildIntent } from '../systems/input/buildIntent'
import {
  breakDownCutStart,
  type CutStartBreakdown,
  type CutStartTick,
} from '../systems/vehicle/cutStartBreakdown'
import { IDLE_INTENT } from '../systems/vehicle/vehicleIntent'
import {
  createFrameRig,
  holdPress,
  playStarts,
  START_LEGS,
  type FrameRig,
  type PressRead,
} from './cutStartFixtures'

// Drill start and turn latency (ticket 504, measurement only, from the TD's felt-drilling list row
// 1 and #433's lane): at stored drill_power 1, 10 and 20 (tip 0), at 30 and 144 frames/s, in the
// live fixed-step loop with `drill.sweptCut` on, driven by #433's rig and script
// (`cutStartFixtures.ts`). Four sets:
// 1. rig 1 (#400)'s mid-shaft start, the press moved across the pose report's 12 phases by
//    resting a tick longer each time, with the report the cut gate waited for;
// 2. starts from rest, on the surface and mid-shaft (#433's two legs);
// 3. a drive turned into a cut (off the pad to the left, then down), on each report phase;
// 4. a cut turned into another cut direction (4 s down from the surface, then left into the
//    shaft wall), on each report phase.
// Each start is split by `cutStartBreakdown` and given in ticks, seconds and the pixels of travel
// lost at `vCut` at the 12 m view height (#39). A press lands on a render frame, so at 30 frames/s
// (two ticks a frame) it lands only on every other report phase; the sets say which phases a run
// reached. A lane: it runs only when named, prints its tables and writes them to
// balance-report/drill-turn-latency.ndjson. It changes no sim and pins no latency: it fails only
// if a start opens no cell, or a start from rest or a drive turn's stale facing on a phase both
// rates reach differs between the frame rates. Rig 1's mid-shaft start read 27-47 ticks of stale
// facing (27 on #433's own phase) until 6b35c88c (#459) and reads 0 on every phase since.

const STORED_RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0 },
  'stored 10': { drill_power: 10, drill_tip: 0 },
  'stored 20': { drill_power: 20, drill_tip: 0 },
}
const RIG_1 = { drill_power: 300, drill_tip: 200 }
const FRAME_RATES = [30, 144]
/** The pose report's interval in ticks (#11 amendment): the phases a press can land on. */
const REPORT_PHASES = 12
/** Pixels a metre at the default 12 m view height (#39): 1080p, and a 390x844 phone. */
const PIXELS_PER_METRE = { '1080p': 90, '390x844': 70 }
/**
 * How long a turn into the shaft wall is held: its first cell on the line ahead opened at most 119
 * ticks after the press on main, and 127 since ticket 506 starts the down cut sooner and so turns
 * at another place in the shaft (the body follows the cut at `vCut` the whole time). 2 s held 120.
 */
const CUT_INTO_CUT_PRESS_SECONDS = 3
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 900_000

type TurnSet = 'rig 1 mid-shaft' | 'drive into cut' | 'cut into cut'

/** One start or turn: where the press landed among the reports, and its breakdown. */
interface PressRun {
  set: TurnSet | `from rest, ${string}`
  rig: string
  framesPerSecond: number
  /** Ticks since the last pose report as the press's first tick ran; null with none before. */
  reportPhase: number | null
  breakdown: CutStartBreakdown | null
  /** The report the cut gate opened on or after: its number after the press and its tick. */
  gateReport: { ordinal: number; tick: number } | null
}

/** A set's spread over the report phases it reached. */
interface PhaseSpread {
  set: string
  rig: string
  framesPerSecond: number
  phasesReached: number
  staleFacing: Spread
  pressToFollow: Spread
  vCut: number
}

interface Spread {
  min: number
  mean: number
  max: number
}

let sink: MemorySink = createMemorySink()

beforeAll(async () => {
  await RAPIER.init()
})

afterEach(() => uninstallRunLog())

/** A fresh store and run log, and the rig on the dock. */
function startRig(levels: Record<string, number>, framesPerSecond: number): FrameRig {
  uninstallRunLog()
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
  return createFrameRig(RAPIER, levels, framesPerSecond)
}

/** The render frames that hold at least `ticks` more fixed ticks. */
function framesForTicks(ticks: number, framesPerSecond: number): number {
  return Math.ceil((ticks * framesPerSecond) / TICKS_PER_SECOND)
}

function reportTicks(): number[] {
  return sink.commands.filter(({ type }) => type === 'reportPose').map(({ tick }) => tick)
}

function reportPhaseOf(press: PressRead): number | null {
  const before = reportTicks().filter((tick) => tick <= press.tickBefore)
  return before.length === 0 ? null : press.tickBefore + 1 - Math.max(...before)
}

/** The last report sent at or before the tick the gate opened, counted from the press. */
function gateReportOf(
  press: PressRead,
  breakdown: CutStartBreakdown | null,
): PressRun['gateReport'] {
  if (breakdown === null) return null
  const opened = breakdown.swivelTicks + breakdown.staleFacingTicks
  const after = reportTicks()
    .map((tick) => tick - press.tickBefore - 1)
    .filter((tick) => tick >= 0 && tick <= opened)
  return after.length === 0 ? null : { ordinal: after.length, tick: after[after.length - 1] }
}

/**
 * A turn's ticks from the new facing on: the gate a cut coasts on before the head engages along
 * the new facing is the old cut's, so it does not count as the new one opening.
 */
function fromNewFacing(ticks: readonly CutStartTick[]): CutStartTick[] {
  const engaged = ticks.findIndex(({ isDrilling }) => isDrilling)
  return ticks.map((tick, at) =>
    at < engaged ? { ...tick, isCutting: false, cutSpeed: 0, opensCell: false } : tick,
  )
}

function readPress(
  set: PressRun['set'],
  rig: string,
  framesPerSecond: number,
  press: PressRead,
): PressRun {
  const breakdown = breakDownCutStart(fromNewFacing(press.ticks))
  return {
    set,
    rig,
    framesPerSecond,
    reportPhase: reportPhaseOf(press),
    breakdown,
    gateReport: gateReportOf(press, breakdown),
  }
}

function eachRate<T>(run: (framesPerSecond: number) => T[]): T[] {
  return FRAME_RATES.flatMap(run)
}

function eachPhase<T>(run: (phase: number) => T): T[] {
  return Array.from({ length: REPORT_PHASES }, (_, phase) => run(phase))
}

function eachStoredRig<T>(run: (rig: string, levels: Record<string, number>) => T[]): T[] {
  return Object.entries(STORED_RIGS).flatMap(([rig, levels]) => run(rig, levels))
}

/** Set 1: #433's script for rig 1, resting `phase` ticks longer before the mid-shaft press. */
function rig1MidShaftByPhase(): PressRun[] {
  return eachRate((fps) =>
    eachPhase((phase) => {
      const rest = fps + framesForTicks(phase, fps)
      const starts = playStarts(startRig(RIG_1, fps), fps, rest)
      return readPress('rig 1 mid-shaft', 'rig 1 (#400)', fps, starts['mid-shaft'])
    }),
  )
}

/** Set 2: #433's starts from rest. */
function startsFromRest(): PressRun[] {
  return eachStoredRig((rig, levels) =>
    eachRate((fps) => {
      const starts = playStarts(startRig(levels, fps), fps)
      return START_LEGS.map((leg) => readPress(`from rest, ${leg}`, rig, fps, starts[leg]))
    }),
  )
}

/** Set 3: off the pad to the left for 2 s and `phase` ticks, then down into the ground. */
function driveIntoCut(): PressRun[] {
  return eachStoredRig((rig, levels) =>
    eachRate((fps) =>
      eachPhase((phase) => {
        const frames = 2 * fps + framesForTicks(phase, fps)
        const rigNow = startRig(levels, fps)
        rigNow.hold(buildIntent(['aim_left']), frames)
        return readPress(
          'drive into cut',
          rig,
          fps,
          holdPress(rigNow, buildIntent(['aim_down']), fps),
        )
      }),
    ),
  )
}

/**
 * Set 4: off the pad, at rest, 4 s and `phase` ticks down from the surface, then left for
 * `CUT_INTO_CUT_PRESS_SECONDS`.
 */
function cutIntoCut(): PressRun[] {
  return eachStoredRig((rig, levels) =>
    eachRate((fps) =>
      eachPhase((phase) => {
        const rigNow = startRig(levels, fps)
        rigNow.hold(buildIntent(['aim_left']), 2 * fps)
        rigNow.hold(IDLE_INTENT, fps)
        rigNow.hold(buildIntent(['aim_down']), 4 * fps + framesForTicks(phase, fps))
        const press = holdPress(rigNow, buildIntent(['aim_left']), CUT_INTO_CUT_PRESS_SECONDS * fps)
        return readPress('cut into cut', rig, fps, press)
      }),
    ),
  )
}

/** Press to the body following the drill: the swivel, then the ticks it stood engaged. */
function pressToFollowTicks(breakdown: CutStartBreakdown): number {
  return breakdown.swivelTicks + breakdown.standingTicks
}

function spreadOf(values: readonly number[]): Spread {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return { min: Math.min(...values), mean: Number(mean.toFixed(2)), max: Math.max(...values) }
}

/** One run a reached phase: at 30 frames/s two phase steps can land on the same report phase. */
function onePerPhase(runs: readonly PressRun[]): PressRun[] {
  const phases = new Map<number | null, PressRun>()
  for (const run of runs) if (!phases.has(run.reportPhase)) phases.set(run.reportPhase, run)
  return [...phases.values()]
}

function spreadsByPhase(runs: readonly PressRun[]): PhaseSpread[] {
  const groups = new Map<string, PressRun[]>()
  for (const run of runs) {
    const key = [run.set, run.rig, run.framesPerSecond].join('|')
    groups.set(key, [...(groups.get(key) ?? []), run])
  }
  return [...groups.values()].map(spreadOfGroup)
}

function spreadOfGroup(group: readonly PressRun[]): PhaseSpread {
  const reached = onePerPhase(group)
  const breakdowns = reached.flatMap(({ breakdown }) => (breakdown === null ? [] : [breakdown]))
  return {
    set: group[0].set,
    rig: group[0].rig,
    framesPerSecond: group[0].framesPerSecond,
    phasesReached: reached.length,
    staleFacing: spreadOf(breakdowns.map(({ staleFacingTicks }) => staleFacingTicks)),
    pressToFollow: spreadOf(breakdowns.map(pressToFollowTicks)),
    vCut: breakdowns[0]?.cutSpeed ?? 0,
  }
}

function seconds(ticks: number): string {
  return (ticks / TICKS_PER_SECOND).toFixed(2)
}

/** Ticks, seconds and the pixels of travel lost at `vCut` on a 1080p and a phone screen. */
function lostTravel(ticks: number, vCut: number): string {
  const metres = (ticks / TICKS_PER_SECOND) * vCut
  const pixels = Object.values(PIXELS_PER_METRE).map((perMetre) => (metres * perMetre).toFixed(0))
  return `${ticks} t / ${seconds(ticks)} s / ${pixels.join('|')} px`
}

function formatRunRow(run: PressRun): string {
  const b = run.breakdown
  const head = [run.set, run.rig, run.framesPerSecond, run.reportPhase ?? '-']
  if (b === null) return [...head, 'no cell opened'].join(' | ')
  const gate = run.gateReport === null ? '-' : `#${run.gateReport.ordinal} @${run.gateReport.tick}`
  return [
    ...head,
    b.cutSpeed.toFixed(2),
    b.swivelTicks,
    b.staleFacingTicks,
    gate,
    b.firstCellTicks,
    b.heldTicks ?? '-',
    b.secondStallTicks,
    b.standingTicks,
    lostTravel(pressToFollowTicks(b), b.cutSpeed),
  ].join(' | ')
}

function formatRunTable(runs: readonly PressRun[]): string {
  const header =
    'set | rig | fps | report phase | vCut m/s | swivel | stale facing | gate report | ' +
    'first cell | held | second stall | standing | press to follow (1080p|phone px)'
  return [header, ...runs.map(formatRunRow)].join('\n')
}

function formatSpreadRow(spread: PhaseSpread): string {
  const { staleFacing: stale, pressToFollow: follow, vCut } = spread
  return [
    spread.set,
    spread.rig,
    spread.framesPerSecond,
    `${spread.phasesReached}/${REPORT_PHASES}`,
    `${stale.min} / ${stale.mean} / ${stale.max}`,
    lostTravel(follow.min, vCut),
    lostTravel(follow.mean, vCut),
    lostTravel(follow.max, vCut),
  ].join(' | ')
}

function formatSpreadTable(spreads: readonly PhaseSpread[]): string {
  const header =
    'set | rig | fps | phases reached | stale facing min / mean / max | press to follow min | ' +
    'mean | max'
  return [header, ...spreads.map(formatSpreadRow)].join('\n')
}

function writeTurnReport(runs: readonly PressRun[], spreads: readonly PhaseSpread[]): void {
  const lines = [{ report: 'drill-turn-latency', ticket: 504 }, ...spreads, ...runs]
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const text = lines.map((line) => JSON.stringify(line)).join('\n')
  writeFileSync(new URL('drill-turn-latency.ndjson', REPORT_FOLDER), `${text}\n`)
}

function fromRestAt(runs: readonly PressRun[], framesPerSecond: number) {
  return runs
    .filter((run) => run.set.startsWith('from rest') && run.framesPerSecond === framesPerSecond)
    .map(({ set, rig, breakdown }) => ({ set, rig, breakdown }))
}

describe('drill start and turn latency (ticket 504)', () => {
  let runs: PressRun[] = []

  beforeAll(() => {
    runs = [...rig1MidShaftByPhase(), ...startsFromRest(), ...driveIntoCut(), ...cutIntoCut()]
    const spreads = spreadsByPhase(runs.filter(({ set }) => !set.startsWith('from rest')))
    console.log(formatRunTable(runs))
    console.log(formatSpreadTable(spreads))
    writeTurnReport(runs, spreads)
  }, RUN_TIMEOUT_MS)

  it('opens a cell after every start and turn', () => {
    expect(runs.filter(({ breakdown }) => breakdown === null).map(formatRunRow)).toEqual([])
  })

  it('starts from rest alike at 30 and 144 frames/s', () => {
    expect(fromRestAt(runs, 144)).toEqual(fromRestAt(runs, 30))
  })

  it('reads the same stale facing at 30 and 144 frames/s on each phase a drive turn reaches', () => {
    expect(staleFacingByPhaseAt(runs, 30)).toEqual(
      staleFacingByPhaseAt(runs, 144).filter(({ phase }) => phase % 2 === 0),
    )
  })

  // Measured on main f0eac6c3 (ticket 504's table on #504). Owner: open, to be set by the GD.
  // Measured 1-12 ticks, mean 6.5, on main f0eac6c3; ticket 506's drill step carries the facing.
  it('turns a drive into a cut with no stale facing on any report phase (ticket 506)', () => {
    const stale = FRAME_RATES.flatMap((framesPerSecond) =>
      staleFacingByPhaseAt(runs, framesPerSecond),
    )
    expect(stale.length).toBeGreaterThan(0)
    expect(stale.filter((row) => row.stale !== 0)).toEqual([])
  })
  it.todo(
    'turns a cut into another cut direction with no stale facing (measured: 1-12 ticks, mean ' +
      '6.42 / 3.67 / 3.67 at stored 1/10/20, 144 frames/s; owner: open, to be set by the GD)',
  )
  it.todo(
    'follows a cut turned into the shaft wall within one cell time (measured: press to follow ' +
      '28-116 ticks, mean 51.67 / 57.08 / 51.5 at stored 1/10/20; owner: open, to be set by the GD)',
  )
  it.todo(
    "pays a start from rest's first cell no slower than steady cutting (measured: standing " +
      '21 / 22 / 19 ticks mid-shaft and 26 / 25 / 20 on the surface at stored 1/10/20; owner: ' +
      'open, to be set by the GD)',
  )
})

/** Each drive-into-cut run's stale facing by the report phase it reached, one run a phase. */
function staleFacingByPhaseAt(runs: readonly PressRun[], framesPerSecond: number) {
  const turns = runs.filter(
    (run) => run.set === 'drive into cut' && run.framesPerSecond === framesPerSecond,
  )
  return Object.keys(STORED_RIGS).flatMap((rig) =>
    onePerPhase(turns.filter((run) => run.rig === rig)).map(({ reportPhase, breakdown }) => ({
      rig,
      phase: reportPhase ?? 0,
      stale: breakdown?.staleFacingTicks,
    })),
  )
}
