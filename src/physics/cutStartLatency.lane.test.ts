import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { POSE_REPORT_INTERVAL_TICKS } from '../constants/balance'
import { BASE_GRAVITY, TICKS_PER_SECOND } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { onCurveSteps } from '../systems/economy/vehicleStats'
import { buildIntent } from '../systems/input/buildIntent'
import {
  breakDownCutStart,
  rampStandingTicksOf,
  type CutStartBreakdown,
  type CutStartTick,
} from '../systems/vehicle/cutStartBreakdown'
import { IDLE_INTENT } from '../systems/vehicle/vehicleIntent'
import {
  createFrameRig,
  holdPress,
  playStarts,
  START_LEGS,
  type StartLeg,
} from './cutStartFixtures'

// Cut start latency from rest (ticket 433, measurement only, from the TD's shape on #430): where
// the ticks go from pressing down into ground until the body follows the drill, at the starting
// drill (stored drill_power 1, 10 and 20, tip 0) and two fast rigs, at 30 and 144 frames/s,
// in the live fixed-step loop with `drill.sweptCut` on. Two starts: from the planet 1 surface
// beside the pad (the head turns from left to down), and again mid-shaft after a second's rest
// (the head already faces down). A lane: it runs only when named, prints the table and writes it
// to balance-report/cut-start-latency.ndjson for comparing runs across commits. The breakdown is
// `systems/vehicle/cutStartBreakdown.ts`, the rig and the script `cutStartFixtures.ts`.
//
// The fast rigs are #400's rig 1 and the 15 m/s rig #397 put in the place of #400's rig 2 (the old
// 4-tick floor's pace). Since #397 took the floor out, rig 2 cuts at 3600 m/s: its surface leg's
// reach clears the bore through P1's centre ahead of the body, so its mid-shaft press starts in
// open bore and there is no start from rest left to measure.
//
// Since ticket 506 the drill step carries the head's facing, so no start reads a stale facing at
// any report phase. The Vertical Scaler's press to first motion is logged per rig, not gated, and
// may not grow with the drill: stored 1, 10 and 20 and the planet-200 on-curve drill on planet 1's
// ground (the rig starts on the planet 1 dock). That drill digs a pit as it drives off the pad, so
// it rests there 3 s before its surface press, and its cut clears the bore ahead as rig 2's does,
// so it has no mid-shaft start. Where the face stands in its cell at the mid-shaft press depends on
// the surface leg, which ticket 506 moves, so a mid-shaft start is compared over a full cell period
// of face positions: the surface leg runs one tick longer each time, as many times as a cell takes.

const RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0 },
  'stored 10': { drill_power: 10, drill_tip: 0 },
  'stored 20': { drill_power: 20, drill_tip: 0 },
  'rig 1 (#400)': { drill_power: 17, drill_tip: 200 },
  '15 m/s rig': { drill_power: 12, drill_tip: 600, engine: 17 },
}
const FRAME_RATES = [30, 144]
const P200_STEPS = onCurveSteps(200)
/** The planet-200 on-curve drill (power and tip), on the planet 1 surface beside the pad. */
const P200_DRILL = { drill_power: P200_STEPS.drill_power, drill_tip: P200_STEPS.drill_tip }
/** The drills press to first motion is compared over, slowest first (Vertical Scaler, ticket 506). */
const FIRST_MOTION_RIGS = ['stored 1', 'stored 10', 'stored 20', 'P200 on-curve drill']
/**
 * Main's mid-shaft standing ticks, the mean over a full cell period of face positions, at 60
 * frames/s (main 61ae3f49, protocol 80, before ticket 506), as the summed ticks over the period:
 * the Vertical Scaler's bar, not slower. Main read 21 at the lane's own face position for stored 1
 * where ticket 506 reads 24; over the period main reads 20 to 25 and the mean is the bar.
 */
const MAIN_MID_SHAFT_MEAN_STANDING: Readonly<Record<string, number>> = {
  'stored 1': 937 / 40,
  'stored 10': 806 / 38,
  'stored 20': 620 / 33,
}
/** Off the pad, the planet-200 drill rests this long in the pit it dug before its surface press. */
const P200_REST_SECONDS = 3
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 600_000

interface StartRun {
  rig: string
  framesPerSecond: number
  leg: StartLeg
  breakdown: CutStartBreakdown | null
  /** The press to the body following the drill (#504's press to follow); null with no cell opened. */
  pressToFirstMotion: number | null
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

function runAllStarts(): StartRun[] {
  return Object.entries(RIGS).flatMap(([rig, levels]) =>
    FRAME_RATES.flatMap((framesPerSecond) => {
      resetGameStore()
      const starts = playStarts(createFrameRig(RAPIER, levels, framesPerSecond), framesPerSecond)
      return START_LEGS.map((leg) => startRunOf(rig, framesPerSecond, leg, starts[leg].ticks))
    }),
  )
}

function startRunOf(
  rig: string,
  framesPerSecond: number,
  leg: StartLeg,
  ticks: readonly CutStartTick[],
): StartRun {
  const breakdown = breakDownCutStart(ticks)
  return {
    rig,
    framesPerSecond,
    leg,
    breakdown,
    pressToFirstMotion: pressToFirstMotionOf(breakdown),
  }
}

/** The planet-200 drill's surface start, from rest in the pit it dug off the pad. */
function runP200SurfaceStarts(): StartRun[] {
  return FRAME_RATES.map((framesPerSecond) => {
    resetGameStore()
    const rig = createFrameRig(RAPIER, P200_DRILL, framesPerSecond)
    rig.hold(buildIntent(['aim_left']), 2 * framesPerSecond)
    rig.hold(IDLE_INTENT, P200_REST_SECONDS * framesPerSecond)
    const press = holdPress(rig, buildIntent(['aim_down']), 4 * framesPerSecond)
    return startRunOf('P200 on-curve drill', framesPerSecond, 'surface', press.ticks)
  })
}

/** The ticks a cell takes the rig at the `vCut` its surface start read: one period of face places. */
function cellPeriodOf(runs: readonly StartRun[], rig: string): number {
  const surface = runs.find((run) => run.rig === rig && run.leg === 'surface')
  return Math.ceil(surface?.breakdown?.cellTicks ?? 0)
}

/** The mid-shaft start's standing ticks with the surface leg `extraTicks` longer, at 60 frames/s. */
function midShaftStandingAfter(levels: Record<string, number>, extraTicks: number): number | null {
  resetGameStore()
  const rig = createFrameRig(RAPIER, levels, TICKS_PER_SECOND)
  rig.hold(buildIntent(['aim_left']), 2 * TICKS_PER_SECOND)
  rig.hold(IDLE_INTENT, TICKS_PER_SECOND)
  rig.hold(buildIntent(['aim_down']), 4 * TICKS_PER_SECOND + extraTicks)
  rig.hold(IDLE_INTENT, TICKS_PER_SECOND)
  const press = holdPress(rig, buildIntent(['aim_down']), 3 * TICKS_PER_SECOND)
  return breakDownCutStart(press.ticks)?.standingTicks ?? null
}

/** Each stored rig's mid-shaft standing ticks over one cell period of face positions. */
function midShaftStandingOverACell(runs: readonly StartRun[]): Record<string, (number | null)[]> {
  const rigs = Object.keys(MAIN_MID_SHAFT_MEAN_STANDING)
  return Object.fromEntries(
    rigs.map((rig) => [
      rig,
      Array.from({ length: cellPeriodOf(runs, rig) }, (_, extra) =>
        midShaftStandingAfter(RIGS[rig], extra),
      ),
    ]),
  )
}

/**
 * A rig's mid-shaft standing bar: main's mean, plus the ticks gravity takes to bring a body from
 * rest past the standing line at its mid-shaft cut speed. Since Bjor's ruling on #724 a cut down
 * gains its speed under gravity (planet 1's full pull at these depths), which is the time a start
 * from rest may add, and only that.
 */
function midShaftStandingBarOf(runs: readonly StartRun[], rig: string): number {
  const midShaft = runs.find((run) => run.rig === rig && run.leg === 'mid-shaft')
  const cutSpeed = midShaft?.breakdown?.cutSpeed ?? 0
  return MAIN_MID_SHAFT_MEAN_STANDING[rig] + rampStandingTicksOf(cutSpeed, BASE_GRAVITY)
}

function meanOf(ticks: readonly (number | null)[]): number {
  const known = ticks.filter((tick): tick is number => tick !== null)
  return known.reduce((sum, tick) => sum + tick, 0) / known.length
}

/** The swivel, then the ticks the engaged drill stood: the press to the body following it. */
function pressToFirstMotionOf(breakdown: CutStartBreakdown | null): number | null {
  return breakdown === null ? null : breakdown.swivelTicks + breakdown.standingTicks
}

/** Press to first motion over `FIRST_MOTION_RIGS` on one leg and frame rate, slowest drill first. */
function firstMotionLadderOf(
  runs: readonly StartRun[],
  leg: StartLeg,
  framesPerSecond: number,
): (number | null)[] {
  return FIRST_MOTION_RIGS.flatMap((rig) =>
    runs
      .filter(
        (run) => run.rig === rig && run.leg === leg && run.framesPerSecond === framesPerSecond,
      )
      .map(({ pressToFirstMotion }) => pressToFirstMotion),
  )
}

function isNonIncreasing(ticks: readonly (number | null)[]): boolean {
  if (ticks.some((at) => at === null)) return false
  return ticks.every((at, index) => index === 0 || (at as number) <= (ticks[index - 1] as number))
}

/**
 * The stale-facing ticks of a turn from driving into a cut: the rig drives left off the pad one
 * tick longer each time, so the press of down lands on each phase of the pose report's interval,
 * one frame a tick. (From rest the report is due at once, so the phase is always the same.)
 */
function staleFacingByReportPhase(): number[] {
  return Array.from({ length: POSE_REPORT_INTERVAL_TICKS }, (_, phase) => {
    resetGameStore()
    const rig = createFrameRig(RAPIER, RIGS['stored 1'], TICKS_PER_SECOND)
    rig.hold(buildIntent(['aim_left']), 2 * TICKS_PER_SECOND + phase)
    const breakdown = breakDownCutStart(rig.hold(buildIntent(['aim_down']), TICKS_PER_SECOND))
    return breakdown?.staleFacingTicks ?? -1
  })
}

function seconds(ticks: number): string {
  return (ticks / TICKS_PER_SECOND).toFixed(2)
}

function formatStartTable(runs: readonly StartRun[]): string {
  const header =
    'rig | fps | start | vCut m/s | cell ticks | swivel | stale facing | approach | first cell | held | ' +
    'second stall | standing (s) | first cell open (s) | press to first motion (s)'
  const rows = runs.map(({ rig, framesPerSecond, leg, breakdown: b, pressToFirstMotion }) =>
    b === null
      ? `${rig} | ${framesPerSecond} | ${leg} | no cell opened`
      : [
          rig,
          framesPerSecond,
          leg,
          b.cutSpeed.toFixed(2),
          b.cellTicks.toFixed(1),
          b.swivelTicks,
          b.staleFacingTicks,
          b.approachTicks,
          b.firstCellTicks,
          b.heldTicks ?? '-',
          b.secondStallTicks,
          `${b.standingTicks} (${seconds(b.standingTicks)})`,
          `${b.firstCellOpenTick} (${seconds(b.firstCellOpenTick)})`,
          firstMotionCellOf(pressToFirstMotion),
        ].join(' | '),
  )
  return [header, ...rows].join('\n')
}

function firstMotionCellOf(ticks: number | null): string {
  return ticks === null ? 'never moved' : `${ticks} (${seconds(ticks)})`
}

function formatMidShaftByFace(byFace: Record<string, (number | null)[]>): string {
  const rows = Object.entries(byFace).map(
    ([rig, ticks]) =>
      `${rig}: mean ${meanOf(ticks).toFixed(2)} (main ${MAIN_MID_SHAFT_MEAN_STANDING[rig].toFixed(2)}), ` +
      `by face position ${ticks.join(' ')}`,
  )
  return ['mid-shaft standing over one cell period of face positions, 60 frames/s', ...rows].join(
    '\n',
  )
}

function writeStartReport(
  runs: readonly StartRun[],
  staleByPhase: readonly number[],
  midShaftByFace: Record<string, (number | null)[]>,
): void {
  const head = { report: 'cut-start-latency', ticket: 506, staleFacingByReportPhase: staleByPhase }
  const lines = [{ ...head, midShaftStandingByFace: midShaftByFace }, ...runs]
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const text = lines.map((line) => JSON.stringify(line)).join('\n')
  writeFileSync(new URL('cut-start-latency.ndjson', REPORT_FOLDER), `${text}\n`)
}

describe('cut start latency from rest (ticket 433)', () => {
  let runs: StartRun[] = []
  let staleByPhase: number[] = []
  let midShaftByFace: Record<string, (number | null)[]> = {}

  beforeAll(() => {
    runs = [...runAllStarts(), ...runP200SurfaceStarts()]
    staleByPhase = staleFacingByReportPhase()
    midShaftByFace = midShaftStandingOverACell(runs)
    console.log(formatStartTable(runs))
    console.log(`stale facing turning from a drive, by report phase: ${staleByPhase.join(' ')}`)
    console.log(formatMidShaftByFace(midShaftByFace))
    writeStartReport(runs, staleByPhase, midShaftByFace)
  }, RUN_TIMEOUT_MS)

  it('opens a first cell on every rig and start', () => {
    expect(runs.filter(({ breakdown }) => breakdown === null)).toEqual([])
  })

  it('starts alike at 30 and 144 frames/s', () => {
    for (const leg of START_LEGS) {
      for (const rig of Object.keys(RIGS)) {
        const [slow, fast] = FRAME_RATES.map(
          (rate) =>
            runs.find((run) => run.rig === rig && run.leg === leg && run.framesPerSecond === rate)
              ?.breakdown,
        )
        expect(fast).toEqual(slow)
      }
    }
  })

  it('reads no stale facing after the head turns, at every report phase (ticket 506)', () => {
    expect(staleByPhase).toEqual(staleByPhase.map(() => 0))
    const stale = runs.map(({ rig, framesPerSecond, leg, breakdown }) => ({
      start: `${rig}, ${leg}, ${framesPerSecond} frames/s`,
      stale: breakdown?.staleFacingTicks,
    }))
    expect(stale).toEqual(stale.map(({ start }) => ({ start, stale: 0 })))
  })

  it('stands no longer mid-shaft than main, bar the gravity ramp from rest, over a full cell period of face positions (Vertical Scaler, ticket 506; #724)', () => {
    for (const [rig, ticks] of Object.entries(midShaftByFace)) {
      expect(ticks.filter((tick) => tick === null)).toEqual([])
      expect(meanOf(ticks)).toBeLessThanOrEqual(midShaftStandingBarOf(runs, rig))
    }
  })

  it('takes no longer from press to first motion with a stronger drill (Vertical Scaler, ticket 506)', () => {
    for (const framesPerSecond of FRAME_RATES) {
      expect(isNonIncreasing(firstMotionLadderOf(runs, 'surface', framesPerSecond))).toBe(true)
      expect(isNonIncreasing(firstMotionLadderOf(runs, 'mid-shaft', framesPerSecond))).toBe(true)
    }
  })
})
