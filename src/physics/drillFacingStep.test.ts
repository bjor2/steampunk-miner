import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CUT_GATE_HOLD_TICKS, POSE_REPORT_INTERVAL_TICKS } from '../constants/balance'
import { TICKS_PER_SECOND } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore } from '../store/gameStore'
import { buildIntent } from '../systems/input/buildIntent'
import { breakDownCutStart, type CutStartTick } from '../systems/vehicle/cutStartBreakdown'
import type { CutGate } from '../systems/vehicle/cutGate'
import { IDLE_INTENT } from '../systems/vehicle/vehicleIntent'
import { createRig, type Rig, type TickRead } from './cutFollowFixtures'

// The drill step carries the head's facing (ticket 506, #433 fix 1): the authority's pose, its cut
// gate and the motor's cut-follow read take the facing the head settled on this tick, not the last
// pose report's, which went out up to 12 ticks earlier. So a turn into a cut opens the gate on the
// settle tick at every phase of the report interval, and the motor's gate is the authority's on
// every tick of the turn. In the live fixed-step loop with `drill.sweptCut` on; a press at 30
// frames/s lands on every second tick, so it reaches every second report phase. A cut turned into
// another may still wait out the gate's hold (#333: no flip within 6 ticks of the last, and the
// old cut's gate closes during the swivel), up to 3 ticks on some phases of left then down; that
// wait is the gate's own rule, so a turn's stale facing is a shut gate whose hold has run out.

/**
 * Stored 21, not the browser run's 20: from purchase 20 the drill sets travel past 140 m/s, so the
 * drive off the pad leaves planet 1's curved surface and where the rig lands is chaotic in its
 * speed. Since ticket 558 cuts it at its own quantum's law speed, purchase 20 lands too late on
 * some phases to turn into a cut within the press; 19 and 21 land in time on every one.
 */
const STORED_RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0 },
  'stored 10': { drill_power: 10, drill_tip: 0 },
  'stored 21': { drill_power: 21, drill_tip: 0 },
}
const FRAME_RATES = [30, 144]
const REPORT_PHASES = Array.from({ length: POSE_REPORT_INTERVAL_TICKS }, (_, phase) => phase)
/** Long enough for the slowest starting drill to swivel and open its first cell (#433: 34 ticks). */
const PRESS_TICKS = 90
const RUN_TIMEOUT_MS = 240_000

type Turn = 'drive into cut' | 'down then left' | 'left then down'

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

/** Off the pad to the left (the Sell bay is its west end, #170) for 2 s and `phase` ticks. */
function driveOffThePad(rig: Rig, phase: number): void {
  rig.hold(buildIntent(['aim_left']), 2 * TICKS_PER_SECOND + phase)
}

/** Off the pad, a second at rest, then down from the surface for 4 s and `phase` ticks. */
function cutDownFromTheSurface(rig: Rig, phase: number): void {
  rig.hold(buildIntent(['aim_left']), 2 * TICKS_PER_SECOND)
  rig.hold(IDLE_INTENT, TICKS_PER_SECOND)
  rig.hold(buildIntent(['aim_down']), 4 * TICKS_PER_SECOND + phase)
}

/** The ticks of the press that turns the head, after the turn's lead-in. */
function pressTurn(rig: Rig, turn: Turn, phase: number): TickRead[] {
  if (turn === 'drive into cut') driveOffThePad(rig, phase)
  else cutDownFromTheSurface(rig, phase)
  if (turn === 'left then down') rig.hold(buildIntent(['aim_left']), 2 * TICKS_PER_SECOND)
  const pressed = turn === 'down then left' ? 'aim_left' : 'aim_down'
  return rig.hold(buildIntent([pressed]), PRESS_TICKS)
}

const playedTurns = new Map<string, TickRead[]>()

/** One turn played once and shared by the specs that read it. */
function turnOf(rig: string, turn: Turn, framesPerSecond: number, phase: number): TickRead[] {
  const key = [rig, turn, framesPerSecond, phase].join('|')
  const known = playedTurns.get(key)
  if (known !== undefined) return known
  const ticks = pressTurn(createRig(RAPIER, STORED_RIGS[rig], framesPerSecond), turn, phase)
  playedTurns.set(key, ticks)
  return ticks
}

/**
 * A press's ticks as a cut start: until the head engages along the new facing a cut-to-cut turn
 * still coasts on the old cut's gate, which does not count as the new one opening.
 */
function cutStartTicksOf(ticks: readonly TickRead[]): CutStartTick[] {
  const engaged = ticks.findIndex(({ result }) => result.flags.isDrilling)
  return ticks.map(({ result, read, speed, opensCell }, at) => ({
    speed,
    isDrilling: result.flags.isDrilling,
    isCutting: at >= engaged && result.isCutting,
    cutSpeed: at >= engaged ? (read?.cutSpeed ?? 0) : 0,
    opensCell: at >= engaged && opensCell,
  }))
}

/** The ticks the engaged drill waited on a shut gate, or null when no cell opened. */
function staleFacingTicksOf(ticks: readonly TickRead[]): number | null {
  return breakDownCutStart(cutStartTicksOf(ticks))?.staleFacingTicks ?? null
}

/**
 * The engaged drill's ticks before its gate opens whose gate stood shut with its hold run out
 * (free to open on fresh ground): the slab read along a facing the head has left.
 */
function staleGateReadsOf(ticks: readonly TickRead[]): number | null {
  const engaged = ticks.findIndex(({ result }) => result.flags.isDrilling)
  const opened = ticks.findIndex(({ result }, at) => at >= engaged && result.isCutting)
  if (engaged < 0 || opened < 0) return null
  return ticks.slice(engaged, opened).filter(({ read }) => isFreeToOpen(read?.gate)).length
}

function isFreeToOpen(gate: CutGate | undefined): boolean {
  return gate?.cutGate === 0 && gate.cutGateLowTicks >= CUT_GATE_HOLD_TICKS
}

type StaleRead = (ticks: readonly TickRead[]) => number | null

/** Each phase's stale reads for every rig and frame rate, named for a readable diff. */
function staleFacingByPhase(turn: Turn, rigs: readonly string[], staleOf: StaleRead): string[] {
  return rigs.flatMap((rig) =>
    FRAME_RATES.flatMap((framesPerSecond) =>
      REPORT_PHASES.map((phase) => {
        const stale = staleOf(turnOf(rig, turn, framesPerSecond, phase))
        return `${rig} at ${framesPerSecond} frames/s, phase ${phase}: ${stale}`
      }),
    ),
  )
}

function readingNoStaleFacing(rows: readonly string[]): string[] {
  return rows.map((row) => row.replace(/: .*$/, ': 0'))
}

/** The ticks a drill step landed on whose motor gate differs from the gate it left. */
function gateMismatchesOf(ticks: readonly TickRead[]): TickRead[] {
  return ticks.filter(
    ({ authorityGate, result }) =>
      authorityGate !== null && (result.isCutting ? 1 : 0) !== authorityGate,
  )
}

describe('drill step facing in the live loop (ticket 506)', () => {
  it(
    'reads no stale facing at any of the 12 report phases, stored 1, 10 and 21, at 30 and 144 frames/s (turn from a drive)',
    () => {
      const rigs = Object.keys(STORED_RIGS)
      const rows = staleFacingByPhase('drive into cut', rigs, staleFacingTicksOf)
      expect(rows).toEqual(readingNoStaleFacing(rows))
    },
    RUN_TIMEOUT_MS,
  )

  it(
    'reads no stale facing after a cut turned into another cut direction (down then left, left then down)',
    () => {
      const rows = (['down then left', 'left then down'] as const).flatMap((turn) =>
        staleFacingByPhase(turn, ['stored 1'], staleGateReadsOf).map((row) => `${turn}, ${row}`),
      )
      expect(rows).toEqual(readingNoStaleFacing(rows))
    },
    RUN_TIMEOUT_MS,
  )

  it(
    'the motor gate equals the authority gate on every tick of a turn into a cut',
    () => {
      const turns = REPORT_PHASES.flatMap((phase) =>
        FRAME_RATES.map((framesPerSecond) =>
          turnOf('stored 1', 'drive into cut', framesPerSecond, phase),
        ),
      )
      expect(turns.flat().some(({ authorityGate }) => authorityGate === 1)).toBe(true)
      expect(turns.flatMap(gateMismatchesOf)).toEqual([])
    },
    RUN_TIMEOUT_MS,
  )
})
