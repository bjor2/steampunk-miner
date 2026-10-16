import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MM_PER_METRE, PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readAuthorityState, submitCommand } from '../store/authorityLink'
import { readLocalVehicle, useGameStore } from '../store/gameStore'
import { setCasingGradeCommand } from '../systems/authority/casingDebugCommands'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { onCurveSteps } from '../systems/economy/vehicleStats'
import { buildIntent } from '../systems/input/buildIntent'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { PoseReporter } from '../systems/vehicle/poseReport'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import { cellDensitySum } from '../systems/world/cellYield'
import type { WorldState } from '../systems/world/worldState'
import { createRig, type Rig } from './cutFollowFixtures'

// Flag-off level legs on the shipped contact rule (ticket 516, the TD's #441 measure, section 1.5
// of its evidence): with `drill.sweptCut` off, as the player plays, each stored rig leaves the pad,
// dives 12 m and drives level west for 250 m through the real loop and Rapier body, at the shipped
// report interval (12 ticks) and with the harness reporting every tick. On `drillContactOf` 7 of
// the 8 legs stuck (stored 200 at 12 ticks at 50 m here, 77.8 m in the TD's rig): the body rested
// on a sliver of ground the stamp could still cut, outside its full-weight core and past the
// face's reach, and the drill did not bite. `levelSliverDrillContactOf` bites there on a level
// cut; stored 200 at 12 ticks still stops, on another cause (the known limit, `isKnownLimit`).
// A leg is stuck when the body moves under 1 m in 600 ticks. Each rig's 80 m down leg
// (casing grade 5, so a cave-in never ends it) is played too and printed, its speed and the
// density it removed per metre, so a run before and after the fix can be compared (#516 holds
// them within 3%). A lane: it runs only when named, prints the table and writes
// balance-report/level-leg-dead-stop.ndjson.

/** The harness's report cadence: the shipped interval, or a report every tick (`takePoseReport`). */
const reportCadence = vi.hoisted(() => ({ isEveryTick: false, reportsSent: 0 }))

vi.mock('../systems/vehicle/poseReport', async (importOriginal) => {
  const shipped = await importOriginal<typeof import('../systems/vehicle/poseReport')>()
  const takePoseReport: typeof shipped.takePoseReport = (reporter, pose, moment, tick) => {
    const report = shipped.takePoseReport(cadencedReporter(reporter), pose, moment, tick)
    if (report.payload !== null) reportCadence.reportsSent++
    return report
  }
  /** Every tick, the last report is forgotten, so the interval is always over. */
  function cadencedReporter(reporter: PoseReporter): PoseReporter {
    return reportCadence.isEveryTick ? { ...reporter, lastSentTick: null } : reporter
  }
  return { ...shipped, takePoseReport }
})

const P200 = onCurveSteps(200)
const RIG_SAFETY = { hull: 5000, cargo_hold: 5000 }
const RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0, ...RIG_SAFETY },
  'stored 10': { drill_power: 10, drill_tip: 0, ...RIG_SAFETY },
  'stored 20': { drill_power: 20, drill_tip: 0, ...RIG_SAFETY },
  'stored 200': { drill_power: P200.drill_power, drill_tip: P200.drill_tip, ...RIG_SAFETY },
}
const REPORT_INTERVALS = [12, 1] as const
const FLAG_OFF = { 'drill.sweptCut': false }
const FRAMES_PER_SECOND = 60
const DIVE_M = 12
const LEVEL_M = 250
const DOWN_M = 80
const DOWN_CASING_GRADE = 5
/** The TD's stuck rule: the body moved under this many metres over the last window of ticks. */
const STUCK_WINDOW_TICKS = 600
const STUCK_UNDER_M = 1
/** A move this long in one tick is a tow back to the dock, not driving. */
const TOW_JUMP_M = 1.5
const HOLD_CHUNK_TICKS = 6
/** A report every tick while the drill bites is 60 a second; half of it proves the harness's. */
const EVERY_TICK_REPORTS_PER_SECOND = 30
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const LEG_TIMEOUT_MS = 1_200_000

type Section = 'level' | 'down'

/** One held leg: how far it went and how it ended. */
interface LegRun {
  rig: string
  section: Section
  reportInterval: number
  metres: number
  ticks: number
  /** Where the body first moved under 1 m in 600 ticks, m along the leg; null when never. */
  stuckAtM: number | null
  isTowed: boolean
  metresPerSecond: number
  densityRemovedPerM: number
  reportsPerSecond: number
}

/** The body's centre after each tick of a leg, while it is held. */
interface HeldLeg {
  positions: Vector2[]
  metres: number
  stuckAtM: number | null
  isTowed: boolean
}

const ticksOf = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)
const runs: LegRun[] = []

beforeAll(async () => {
  await RAPIER.init()
})

beforeEach(() => {
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

afterAll(() => {
  console.log(formatTable(runs))
  writeRuns(runs)
})

/** A fresh rig leaves the pad, dives 12 m, then drives level west for up to 250 m. */
function runLevelLeg(rig: string, reportInterval: number): LegRun {
  const play = createPlay(rig, reportInterval)
  play.rig.hold(buildIntent(['aim_left']), ticksOf(2))
  holdLeg(play.rig, buildIntent(['aim_down']), DIVE_M, ticksOf(120), play.position())
  return play.measure('level', buildIntent(['aim_left']), LEVEL_M)
}

/** A fresh rig leaves the pad and drills down for up to 80 m, its casing grade 5. */
function runDownLeg(rig: string, reportInterval: number): LegRun {
  const play = createPlay(rig, reportInterval)
  submitCommand(useGameStore.getState().playerId, setCasingGradeCommand(DOWN_CASING_GRADE))
  play.rig.hold(buildIntent(['aim_left']), ticksOf(2))
  play.rig.hold(buildIntent([]), HOLD_CHUNK_TICKS)
  return play.measure('down', buildIntent(['aim_down']), DOWN_M)
}

/** A flag-off rig at 60 frames/s, reporting at `reportInterval`, and the measure of one leg. */
function createPlay(rig: string, reportInterval: number) {
  reportCadence.isEveryTick = reportInterval === 1
  const played = createRig(RAPIER, RIGS[rig], FRAMES_PER_SECOND, FLAG_OFF)
  let last = positionOfPose()
  const position = () => last
  const measure = (section: Section, intent: VehicleIntent, metres: number): LegRun => {
    const before = { world: readAuthorityState().world, reports: reportCadence.reportsSent }
    const held = holdLeg(played, intent, metres, ticksOf(450), last)
    last = held.positions.at(-1) ?? last
    const seconds = held.positions.length * PHYSICS_TIMESTEP
    return {
      rig,
      section,
      reportInterval,
      metres: hundredthsOf(held.metres),
      ticks: held.positions.length,
      stuckAtM: held.stuckAtM === null ? null : hundredthsOf(held.stuckAtM),
      isTowed: held.isTowed,
      metresPerSecond: hundredthsOf(held.metres / seconds),
      densityRemovedPerM: hundredthsOf(densityRemovedOf(before.world, held) / held.metres),
      reportsPerSecond: hundredthsOf((reportCadence.reportsSent - before.reports) / seconds),
    }
  }
  const rigWithPosition: Rig = {
    hold: (intent, ticks) => {
      const reads = played.hold(intent, ticks)
      last = reads.at(-1)?.position ?? last
      return reads
    },
  }
  return { rig: rigWithPosition, position, measure }
}

/** The pose the store holds for the local vehicle, planet metres. */
function positionOfPose(): Vector2 {
  const pose = readLocalVehicle().pose
  if (pose === null) throw new Error('the starting planet has no dock')
  return { x: pose.x / MM_PER_METRE, y: pose.y / MM_PER_METRE }
}

/** Holds `intent` until the body has gone `metres` along its path, sticks, is towed or runs out. */
function holdLeg(
  rig: Rig,
  intent: VehicleIntent,
  metres: number,
  capTicks: number,
  from: Vector2,
): HeldLeg {
  const leg: HeldLeg = { positions: [], metres: 0, stuckAtM: null, isTowed: false }
  let previous = from
  while (isLegHeld(leg, metres, capTicks)) {
    for (const { position } of rig.hold(intent, HOLD_CHUNK_TICKS)) {
      leg.isTowed ||= distanceOf(position, previous) > TOW_JUMP_M
      leg.metres += distanceOf(position, previous)
      leg.positions.push(position)
      previous = position
    }
    leg.stuckAtM = isStuck(leg.positions) ? leg.metres : null
  }
  return leg
}

function isLegHeld(leg: HeldLeg, metres: number, capTicks: number): boolean {
  const hasEnded = leg.isTowed || leg.stuckAtM !== null || leg.metres >= metres
  return !hasEnded && leg.positions.length < capTicks
}

/** The TD's rule: under 1 m between the body's centre now and 600 ticks ago. */
function isStuck(positions: readonly Vector2[]): boolean {
  if (positions.length <= STUCK_WINDOW_TICKS) return false
  const now = positions[positions.length - 1]
  const windowAgo = positions[positions.length - 1 - STUCK_WINDOW_TICKS]
  return distanceOf(now, windowAgo) < STUCK_UNDER_M
}

/** The density the leg took out of every cell round its path, from the world before it. */
function densityRemovedOf(before: WorldState, leg: HeldLeg): number {
  const state = readAuthorityState()
  const params = planetParamsOf(state.planet)
  if (params === null || leg.positions.length === 0) return 0
  const xs = leg.positions.map(({ x }) => Math.floor(x))
  const ys = leg.positions.map(({ y }) => Math.floor(y))
  let removed = 0
  for (let tx = Math.min(...xs) - 3; tx <= Math.max(...xs) + 3; tx++) {
    for (let ty = Math.min(...ys) - 3; ty <= Math.max(...ys) + 3; ty++) {
      const tile = { tx, ty }
      removed += cellDensitySum(before, params, tile) - cellDensitySum(state.world, params, tile)
    }
  }
  return removed
}

function distanceOf(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function hundredthsOf(value: number): number {
  return Math.round(value * 100) / 100
}

function formatTable(legs: readonly LegRun[]): string {
  const header =
    'rig | section | report every | m | ticks | stuck at m | towed | m/s | density removed / m | reports / s'
  const rows = legs.map((leg) =>
    [
      leg.rig,
      leg.section,
      leg.reportInterval,
      leg.metres,
      leg.ticks,
      leg.stuckAtM ?? '-',
      leg.isTowed ? 'yes' : 'no',
      leg.metresPerSecond,
      leg.densityRemovedPerM,
      leg.reportsPerSecond,
    ].join(' | '),
  )
  return [header, ...rows].join('\n')
}

function writeRuns(legs: readonly LegRun[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = legs.map((leg) => JSON.stringify({ ticket: 516, ...leg }))
  writeFileSync(new URL('level-leg-dead-stop.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

/** The leg ran its full length: never stuck, never towed. */
function expectFullLeg(leg: LegRun, metres: number): void {
  expect({ stuckAtM: leg.stuckAtM, isTowed: leg.isTowed }).toEqual({
    stuckAtM: null,
    isTowed: false,
  })
  expect(leg.metres).toBeGreaterThanOrEqual(metres)
}

/** The harness's every-tick cadence took: a biting drill reported well past 5 a second. */
function expectCadence(leg: LegRun): void {
  if (leg.reportInterval === 1) {
    expect(leg.reportsPerSecond).toBeGreaterThan(EVERY_TICK_REPORTS_PER_SECOND)
  }
}

/**
 * The known limit (TD ruling 6225171313 on #516): stored 200 at the 12-tick interval still stops.
 * The sawtooth carries the body past the last report's stamp at about 5.9 m/s, and it comes to
 * rest on a floor contour where the stamp holds 1 solid and 0 cuttable samples, so no contact rule
 * can bite. #514 reports every tick while the drill bites, which removes the cause; the limit
 * applies only with its kill-switch off. The case stays, expected to fail, so it turns red if
 * anyone fixes or worsens it.
 */
function isKnownLimit(rig: string, reportInterval: number): boolean {
  return rig === 'stored 200' && reportInterval === 12
}

describe('flag-off level legs on the shipped contact rule (ticket 516)', () => {
  for (const rig of Object.keys(RIGS)) {
    for (const reportInterval of REPORT_INTERVALS) {
      const itLeg = isKnownLimit(rig, reportInterval) ? it.fails : it
      itLeg(
        `drives the ${rig} rig level its full 250 m reporting every ${reportInterval} ticks`,
        () => {
          const leg = runLevelLeg(rig, reportInterval)
          runs.push(leg)
          expectCadence(leg)
          expectFullLeg(leg, LEVEL_M)
        },
        LEG_TIMEOUT_MS,
      )
    }
  }
})

describe('flag-off down legs beside them (ticket 516, printed for the 3% comparison)', () => {
  for (const rig of Object.keys(RIGS)) {
    for (const reportInterval of REPORT_INTERVALS) {
      it(
        `drills the ${rig} rig 80 m down reporting every ${reportInterval} ticks`,
        () => {
          const leg = runDownLeg(rig, reportInterval)
          runs.push(leg)
          expectCadence(leg)
          expectFullLeg(leg, DOWN_M)
        },
        LEG_TIMEOUT_MS,
      )
    }
  }
})
