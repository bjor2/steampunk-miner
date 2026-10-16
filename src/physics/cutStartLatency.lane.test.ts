import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { POSE_REPORT_INTERVAL_TICKS } from '../constants/balance'
import { TICKS_PER_SECOND } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { buildIntent } from '../systems/input/buildIntent'
import { breakDownCutStart, type CutStartBreakdown } from '../systems/vehicle/cutStartBreakdown'
import { createFrameRig, playStarts, START_LEGS, type StartLeg } from './cutStartFixtures'

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

const RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0 },
  'stored 10': { drill_power: 10, drill_tip: 0 },
  'stored 20': { drill_power: 20, drill_tip: 0 },
  'rig 1 (#400)': { drill_power: 300, drill_tip: 200 },
  '15 m/s rig': { drill_power: 200, drill_tip: 600, engine: 5000 },
}
const FRAME_RATES = [30, 144]
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const RUN_TIMEOUT_MS = 600_000

interface StartRun {
  rig: string
  framesPerSecond: number
  leg: StartLeg
  breakdown: CutStartBreakdown | null
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
      return START_LEGS.map((leg) => ({
        rig,
        framesPerSecond,
        leg,
        breakdown: breakDownCutStart(starts[leg].ticks),
      }))
    }),
  )
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
    'rig | fps | start | vCut m/s | cell ticks | swivel | stale facing | first cell | held | ' +
    'second stall | standing (s) | first cell open (s)'
  const rows = runs.map(({ rig, framesPerSecond, leg, breakdown: b }) =>
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
          b.firstCellTicks,
          b.heldTicks ?? '-',
          b.secondStallTicks,
          `${b.standingTicks} (${seconds(b.standingTicks)})`,
          `${b.firstCellOpenTick} (${seconds(b.firstCellOpenTick)})`,
        ].join(' | '),
  )
  return [header, ...rows].join('\n')
}

function writeStartReport(runs: readonly StartRun[], staleByPhase: readonly number[]): void {
  const lines = [
    { report: 'cut-start-latency', ticket: 433, staleFacingByReportPhase: staleByPhase },
    ...runs,
  ]
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const text = lines.map((line) => JSON.stringify(line)).join('\n')
  writeFileSync(new URL('cut-start-latency.ndjson', REPORT_FOLDER), `${text}\n`)
}

describe('cut start latency from rest (ticket 433)', () => {
  let runs: StartRun[] = []
  let staleByPhase: number[] = []

  beforeAll(() => {
    runs = runAllStarts()
    staleByPhase = staleFacingByReportPhase()
    console.log(formatStartTable(runs))
    console.log(`stale facing turning from a drive, by report phase: ${staleByPhase.join(' ')}`)
    writeStartReport(runs, staleByPhase)
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

  it('reads a stale facing for at most one pose report interval after the head turns', () => {
    expect(staleByPhase.every((ticks) => ticks >= 0 && ticks <= POSE_REPORT_INTERVAL_TICKS)).toBe(
      true,
    )
  })
})
