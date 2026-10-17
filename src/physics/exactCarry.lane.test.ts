import RAPIER from '@dimforge/rapier3d-compat'
import { mkdirSync, writeFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTHORITY_DEV_FLAGS, type AuthorityDevFlags, type DevFlags } from '../constants/devFlags'
import { MM_PER_METRE, PHYSICS_TIMESTEP } from '../constants/physics'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { readAuthorityState, submitCommand } from '../store/authorityLink'
import { readLocalVehicle, useGameStore } from '../store/gameStore'
import { vehicleOf, type AuthorityState } from '../systems/authority/authorityState'
import { setCasingGradeCommand } from '../systems/authority/casingDebugCommands'
import { lawWorkRemovedOf } from '../systems/authority/cutCarryFixtures'
import { digSubStepsOfCells } from '../systems/authority/drillCutTally'
import {
  isHeatAtLaw,
  isUnderRatchet,
  isUnderTankFloor,
  isWithinLawShare,
  lawChargeBarsOf,
  lawChargeTextOf,
  QUANTA_PER_LAW_WORK,
  sweptVerdictOf,
  type LawChargeBars,
} from '../systems/authority/lawChargeBars'
import { CUT_ENERGY_DENOMINATOR, LAW_WORK_PER_DRILL_TICK } from '../systems/vehicle/cutCarry'
import { planetParamsOf } from '../systems/authority/planetOfState'
import { bandHeatPerSecond, drillHeatPerSecond } from '../systems/economy/heatEconomy'
import { onCurveSteps } from '../systems/economy/vehicleStats'
import { buildIntent } from '../systems/input/buildIntent'
import { add } from '../systems/money'
import type { Vector2 } from '../systems/vehicle/localFrame'
import type { PoseReporter } from '../systems/vehicle/poseReport'
import { heatUnitsPerTickOf } from '../systems/vehicle/vehicleHeat'
import type { VehicleIntent } from '../systems/vehicle/vehicleIntent'
import type { VehicleState } from '../systems/vehicle/vehicleState'
import type { YieldedCell } from '../systems/world/cellYield'
import { bandOfTile } from '../systems/world/planetGeometry'
import type { PlanetParams } from '../systems/world/planetParams'
import type { TilePoint } from '../systems/world/tileGrid'
import { isTileYielded, materialCellAt, type WorldState } from '../systems/world/worldState'
import { createRig, type Rig } from './cutFollowFixtures'

// The report cut charged on density removed, against the analytic law value in the real loop
// (ticket 535, A6 "Option L": the TD shape 6228682000 with its geometry amendment 6228838042, VS
// 6228674086 and 6228848270, Systems 6228669500, and the reference VS ruled on the ticket,
// 6230602042, recorded by the GD 6230602177). Each rig leaves the pad and plays, through the
// real loop and Rapier body, an 80 m leg down (flat: the body upright down the dock's column,
// casing grade 5 so a cave-in never ends it) and, from a fresh start, a 12 m dive and a 250 m leg
// level west (tilted: the body rolls with the ground round the planet). Paths: the swept cut (at
// its shipped report cadence, logged beside), the report cut with the charge on
// (`drill.exactCarry`) at the shipped 12 ticks and every tick (the harness below, as
// `levelLegDeadStop.lane.test.ts` does), and the protocol-83 charge (the switch off) at both,
// which is main's player path. Read per leg, from the ground and the tank:
// - law work: each cell's density removed times its law time at the rig's drill, in density
//   sub-steps (`cutCarryFixtures.ts`, the carry's own unit, as the slab replay reads it);
// - energy: the quanta the tank lost each tick (the rig refills it every 60 ticks);
// - heat ticks: what the report heats for before the gauge's clamp: the law work removed over a
//   drill tick's on the charged paths (its carry read from the vehicle), the broken cells' summed
//   dig time over 60 on the swept path, the drilled ticks on the protocol-83 one;
// - cells yielded, metres, metres a second, and the energy debt a tow dropped (VS: the maximum
//   per run is logged; more than one cell's worth goes to the GD).
// Gated (VS, hard, `lawChargeBars.ts`): on every leg of at least 100 quanta, energy per unit of
// law work within 1% of the analytic law value, under the tank floor and the ratchet, and heat at
// least the law's less one drill tick; and the regression gate of the TD's amendment (VS
// confirmed): with the charge on or off at the same cadence the carve is byte-identical (the same
// cells, law work, metres and ticks), only energy and heat moving. Logged, never gated: the ratio
// to swept (amber outside 5%; swept's own charge is #540's), the absolute geometry bars (law work
// per metre at least 1.000 and the 250 m window at most 1.050, cells per metre within 5%), which
// are #514's merge bars, energy and heat per metre, energy per yielded cell, and the protocol-83
// rows (main). The ladder (stored 1 to 200) logs law work per metre at every rung. One
// heat-planet rig (planet 8, on-curve) reads the gauge itself: drill heat per unit of law work at
// least the law's, less one drill tick. A lane: it runs only when named, prints the table and
// writes balance-report/exact-carry.ndjson; the slab replay (`authority/lawCarrySlab.lane.test.ts`)
// reads its 25 and 44 m/s rows to validate itself against the loop.

/** The harness's report cadence: the shipped interval, or a report every tick (`takePoseReport`). */
const reportCadence = vi.hoisted(() => ({ isEveryTick: false }))

vi.mock('../systems/vehicle/poseReport', async (importOriginal) => {
  const shipped = await importOriginal<typeof import('../systems/vehicle/poseReport')>()
  const takePoseReport: typeof shipped.takePoseReport = (reporter, pose, moment, tick) =>
    shipped.takePoseReport(cadencedReporter(reporter), pose, moment, tick)
  /** Every tick, the last report is forgotten, so the interval is always over. */
  function cadencedReporter(reporter: PoseReporter): PoseReporter {
    return reportCadence.isEveryTick ? { ...reporter, lastSentTick: null } : reporter
  }
  return { ...shipped, takePoseReport }
})

const RIG_SAFETY = { hull: 5000, cargo_hold: 5000 }
/** VS's rows (`sweptFreshCarveLoop.test.ts`, `cutSmoothness.test.ts`): band-1 cut speed by name. */
const SPEED_RIGS: Readonly<Record<string, Record<string, number>>> = {
  '25 m/s': { drill_power: 250, drill_tip: 600, engine: 5000, ...RIG_SAFETY },
  '44 m/s': { drill_power: 300, drill_tip: 200, ...RIG_SAFETY },
  '240 m/s': { drill_power: 450, drill_tip: 600, ...RIG_SAFETY },
  '3600 m/s': { drill_power: 2000, drill_tip: 600, ...RIG_SAFETY },
}
/** Systems' ladder, stored as `levelLegDeadStop.lane.test.ts` stores it; the 7-13 m/s rows among them. */
const P200 = onCurveSteps(200)
const LADDER_RIGS: Readonly<Record<string, Record<string, number>>> = {
  'stored 1': { drill_power: 1, drill_tip: 0, ...RIG_SAFETY },
  'stored 10': { drill_power: 10, drill_tip: 0, ...RIG_SAFETY },
  'stored 20': { drill_power: 20, drill_tip: 0, ...RIG_SAFETY },
  'stored 50': { drill_power: 50, drill_tip: 0, ...RIG_SAFETY },
  'stored 100': { drill_power: 100, drill_tip: 0, ...RIG_SAFETY },
  'stored 200': { drill_power: P200.drill_power, drill_tip: P200.drill_tip, ...RIG_SAFETY },
}
const HEAT_PLANET = 8
const HEAT_RIG = { ...onCurveSteps(HEAT_PLANET), ...RIG_SAFETY }

/** A path: the client's flags, the authority's switch and the report cadence. */
interface Path {
  flags: DevFlags
  isExactCarry: boolean
  isEveryTick: boolean
}

const PATHS: Readonly<Record<string, Path>> = {
  swept: { flags: { 'drill.sweptCut': true }, isExactCarry: true, isEveryTick: false },
  'exact @12': { flags: { 'drill.sweptCut': false }, isExactCarry: true, isEveryTick: false },
  'exact @1': { flags: { 'drill.sweptCut': false }, isExactCarry: true, isEveryTick: true },
  'main @12': { flags: { 'drill.sweptCut': false }, isExactCarry: false, isEveryTick: false },
  'main @1': { flags: { 'drill.sweptCut': false }, isExactCarry: false, isEveryTick: true },
}
const EXACT_PATHS = ['exact @12', 'exact @1'] as const

type Section = 'down' | 'level'

const FRAMES_PER_SECOND = 60
const DIVE_M = 12
const LEVEL_M = 250
const DOWN_M = 80
const HEAT_DIVE_M = 5
const HEAT_DOWN_M = 30
const DOWN_CASING_GRADE = 5
const LEG_CAP_SECONDS = 450
/** The TD's stuck rule: the body moved under 1 m over the last 600 ticks. */
const STUCK_WINDOW_TICKS = 600
const STUCK_UNDER_M = 1
/** A move this long in one tick is a tow back to the dock, not driving. */
const TOW_JUMP_M = 1.5
/** Cells this far round the body, each way, are watched for a yield each tick. */
const WATCH_CELLS = 3
const SUB_STEPS_PER_TICK = 60
/** The tank the rig refills to every 60 ticks: 150 units of 240 quanta. */
const REFILLED_QUANTA = 150 * 240
const LEVEL_WINDOW_CEILING = 1.05
/** The charge's numerator per density sub-step of law work at the drill's whole share (`cutCarry.ts`). */
const LAW_NUMERATOR_PER_SUB_STEP = 10_000 * 4
/** Under this many metres a leg is no reading: the rig jammed or never left the pad. */
const MIN_READ_M = 10
const REPORT_FOLDER = new URL('../../balance-report/', import.meta.url)
const LEG_TIMEOUT_MS = 1_800_000

/** What one leg of one rig on one path read. */
interface LegReading {
  rig: string
  path: string
  section: Section
  planet: number
  metres: number
  ticks: number
  metresPerSecond: number
  cells: number
  lawWork: number
  /** The hardest cell the leg cut: one cell of law work, the bars' quantum. */
  oneCellLaw: number
  energy: number
  heatTicks: number
  /** Drill heat ticks read off the gauge (heat planet only), else null. */
  gaugeHeatTicks: number | null
  /** The energy carry a tow dropped on this leg, in quanta: a debt is free energy (VS). */
  debtDroppedQuanta: number
  stuck: boolean
}

const readings: LegReading[] = []

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
  console.log(formatTable(readings))
  console.log(debtDroppedTextOf(readings))
  writeReadings(readings)
})

/** Runs `play` with the authority's `drill.exactCarry` as `path` has it, restored after. */
function withExactCarry<T>(path: Path, play: () => T): T {
  const flags = AUTHORITY_DEV_FLAGS as { -readonly [K in keyof AuthorityDevFlags]: boolean }
  flags['drill.exactCarry'] = path.isExactCarry
  try {
    return play()
  } finally {
    flags['drill.exactCarry'] = true
  }
}

/** A fresh rig on `path`: 2 s off the pad, then the leg of `section`. */
function playLeg(
  rigName: string,
  levels: Record<string, number>,
  pathName: string,
  section: Section,
) {
  const path = PATHS[pathName]
  reportCadence.isEveryTick = path.isEveryTick
  return withExactCarry(path, () => {
    const rig = trackedRigOf(createRig(RAPIER, levels, FRAMES_PER_SECOND, path.flags))
    if (section === 'down') submitCasingGrade()
    rig.hold(buildIntent(['aim_left']), ticksOf(2))
    if (section === 'level') holdLeg(rig, buildIntent(['aim_down']), DIVE_M)
    const intent = buildIntent([section === 'down' ? 'aim_down' : 'aim_left'])
    const metres = section === 'down' ? DOWN_M : LEVEL_M
    return { rigName, pathName, section, ...measureLeg(rig, intent, metres) }
  })
}

/** The heat-planet rig: off planet 8's pad, 5 m down, then the measured 30 m down. */
function playHeatLeg(pathName: string) {
  const path = PATHS[pathName]
  reportCadence.isEveryTick = path.isEveryTick
  return withExactCarry(path, () => {
    const rig = trackedRigOf(
      createRig(RAPIER, HEAT_RIG, FRAMES_PER_SECOND, path.flags, HEAT_PLANET),
    )
    submitCasingGrade()
    rig.hold(buildIntent(['aim_left']), ticksOf(2))
    holdLeg(rig, buildIntent(['aim_down']), HEAT_DIVE_M)
    const heatBefore = vehicleOf(readAuthorityState(), playerIdOf()).heat.level
    const leg = measureLeg(rig, buildIntent(['aim_down']), HEAT_DOWN_M)
    const heatAfter = vehicleOf(readAuthorityState(), playerIdOf()).heat.level
    const gaugeHeatTicks = drillHeatTicksOf(heatAfter - heatBefore, leg.bands)
    return {
      rigName: `planet ${HEAT_PLANET} on-curve`,
      pathName,
      section: 'down' as const,
      ...leg,
      gaugeHeatTicks,
    }
  })
}

function submitCasingGrade(): void {
  submitCommand(playerIdOf(), setCasingGradeCommand(DOWN_CASING_GRADE))
}

function playerIdOf(): string {
  return useGameStore.getState().playerId
}

/** The running reads of a leg, one tick at a time. */
interface LegTally {
  positions: Vector2[]
  metres: number
  cells: number
  energy: number
  digSubSteps: number
  /** The drill ticks the charged paths heated for: the heat carry's whole ticks per report. */
  carriedHeatTicks: number
  drilledTicks: number
  /** The band under the body each tick, for the gauge's band heat. */
  bands: number[]
  /** The energy carry the tow dropped, in quanta (VS: logged, a debt over one cell goes to the GD). */
  debtDroppedQuanta: number
  isTowed: boolean
}

/** Holds `intent` one tick at a time for `metres`, reading the ground, the tank and the drill. */
function measureLeg(rig: TrackedRig, intent: VehicleIntent, metres: number) {
  const start = readAuthorityState()
  const tally: LegTally = {
    positions: [],
    metres: 0,
    cells: 0,
    energy: 0,
    digSubSteps: 0,
    carriedHeatTicks: 0,
    drilledTicks: 0,
    bands: [],
    debtDroppedQuanta: 0,
    isTowed: false,
  }
  let previous = rig.position()
  while (isLegHeld(tally, metres)) {
    const before = readAuthorityState()
    const [read] = rig.hold(intent, 1)
    noteTick(tally, before, readAuthorityState(), read.position)
    tally.isTowed ||= distanceOf(read.position, previous) > TOW_JUMP_M
    tally.metres += distanceOf(read.position, previous)
    tally.drilledTicks += read.result.flags.isDrilling ? 1 : 0
    tally.positions.push(read.position)
    previous = read.position
  }
  const law = lawWorkOf(start, readAuthorityState(), tally.positions)
  return {
    planet: start.planet.index,
    metres: tally.metres,
    ticks: tally.positions.length,
    cells: tally.cells,
    lawWork: law.lawWork,
    oneCellLaw: law.hardest,
    energy: tally.energy,
    digSubSteps: tally.digSubSteps,
    carriedHeatTicks: tally.carriedHeatTicks,
    drilledTicks: tally.drilledTicks,
    bands: tally.bands,
    debtDroppedQuanta: tally.debtDroppedQuanta,
    stuck: isStuck(tally.positions) || tally.isTowed,
  }
}

function isLegHeld(tally: LegTally, metres: number): boolean {
  const hasEnded = tally.isTowed || isStuck(tally.positions) || tally.metres >= metres
  return !hasEnded && tally.positions.length < ticksOf(LEG_CAP_SECONDS)
}

/** One tick's yields, their dig time and the quanta the tank lost. */
function noteTick(tally: LegTally, before: AuthorityState, after: AuthorityState, at: Vector2) {
  const params = planetParamsOf(after.planet)
  if (params === null) return
  const yielded = yieldedCellsOf(before.world, after.world, params, at)
  tally.cells += yielded.length
  tally.digSubSteps += digSubStepsOfCells(before, params, playerIdOf(), yielded)
  tally.carriedHeatTicks += carriedHeatTicksOf(before, after)
  tally.energy += energyLostOf(before, after)
  tally.debtDroppedQuanta += debtDroppedOf(before, after)
  tally.bands.push(bandOfTile(params, Math.floor(at.x), Math.floor(at.y)))
}

/**
 * The energy carry a tow dropped this tick, in quanta: the stranded vehicle's carry when the
 * rescue brings it to the dock (`vehicleTransitions.ts`); 0 on any other tick, a dock keeps it.
 */
function debtDroppedOf(before: AuthorityState, after: AuthorityState): number {
  const was = vehicleOf(before, playerIdOf())
  const now = vehicleOf(after, playerIdOf())
  if (!isTowOf(was, now)) return 0
  return (was.cutEnergyCarry ?? 0) / CUT_ENERGY_DENOMINATOR
}

function isTowOf(was: VehicleState, now: VehicleState): boolean {
  return (was.mode === 'stranded' || was.mode === 'destroyed') && now.mode === 'docked'
}

/** The cells round the body that yielded this tick, as they stood before it. */
function yieldedCellsOf(
  before: WorldState,
  after: WorldState,
  params: PlanetParams,
  at: Vector2,
): YieldedCell[] {
  const yielded: YieldedCell[] = []
  for (let dy = -WATCH_CELLS; dy <= WATCH_CELLS; dy++) {
    for (let dx = -WATCH_CELLS; dx <= WATCH_CELLS; dx++) {
      const tile = { tx: Math.floor(at.x) + dx, ty: Math.floor(at.y) + dy }
      if (isTileYielded(before, tile) || !isTileYielded(after, tile)) continue
      yielded.push({ tile, cell: materialCellAt(before, params, tile) })
    }
  }
  return yielded
}

/**
 * The whole drill ticks the charged report heated for this tick (ticket 535): the heat carry's
 * fall, read on the vehicle, plus the law work the tank's charge shows tallied, over a drill
 * tick's law work. 0 on a tick with no report, or with the charge off.
 */
function carriedHeatTicksOf(before: AuthorityState, after: AuthorityState): number {
  const was = vehicleOf(before, playerIdOf())
  const now = vehicleOf(after, playerIdOf())
  const owed = (was.cutEnergyCarry ?? 0) - (now.cutEnergyCarry ?? 0)
  const paid = Math.max(0, energyLostOf(before, after)) * CUT_ENERGY_DENOMINATOR + owed
  const law = Math.round(paid / LAW_NUMERATOR_PER_SUB_STEP)
  const heated = (was.cutHeatCarry ?? 0) + law - (now.cutHeatCarry ?? 0)
  return heated <= 0 ? 0 : Math.round(heated / LAW_WORK_PER_DRILL_TICK)
}

/** The quanta charged over a tick; a tick the rig refilled on started from the refilled tank. */
function energyLostOf(before: AuthorityState, after: AuthorityState): number {
  const was = vehicleOf(before, playerIdOf()).energy
  const now = vehicleOf(after, playerIdOf()).energy
  return now > was ? Math.max(0, REFILLED_QUANTA - now) : was - now
}

/**
 * The law work removed round the path, in density sub-steps: every cell's density removed times
 * its law time at the drill the rig started the leg with (`cutCarryFixtures.ts`), and the most
 * one cell lost, the bars' one-cell quantum.
 */
function lawWorkOf(start: AuthorityState, end: AuthorityState, positions: readonly Vector2[]) {
  if (planetParamsOf(end.planet) === null || positions.length === 0)
    return { lawWork: 0, hardest: 0 }
  const tiles = tilesRoundPath(positions)
  const player = playerIdOf()
  const lawOfTile = (tile: TilePoint) => lawWorkRemovedOf(start, end.world, [tile], player)
  return {
    lawWork: lawWorkRemovedOf(start, end.world, tiles, player),
    hardest: tiles.reduce((most, tile) => Math.max(most, lawOfTile(tile)), 0),
  }
}

/** The cells within `WATCH_CELLS` of the path's bounding box, in column order. */
function tilesRoundPath(positions: readonly Vector2[]): TilePoint[] {
  const xs = positions.map(({ x }) => Math.floor(x))
  const ys = positions.map(({ y }) => Math.floor(y))
  const tiles: TilePoint[] = []
  for (let tx = Math.min(...xs) - WATCH_CELLS; tx <= Math.max(...xs) + WATCH_CELLS; tx++) {
    for (let ty = Math.min(...ys) - WATCH_CELLS; ty <= Math.max(...ys) + WATCH_CELLS; ty++) {
      tiles.push({ tx, ty })
    }
  }
  return tiles
}

/**
 * The drill ticks the gauge heated for: its rise less each tick's band heat, over a drill tick's
 * own heat at the leg's band (`heatRules.ts`: a drill tick heats band plus drill, any other band
 * alone, both in whole units a tick; nothing cools below the surface outside a lined corridor).
 */
function drillHeatTicksOf(rise: number, bands: readonly number[]): number {
  const bandUnits = bands.reduce((sum, band) => sum + bandUnitsPerTick(band), 0)
  const band = bands.at(-1) ?? 1
  const drillUnits =
    heatUnitsPerTickOf(add(bandHeatPerSecond(HEAT_PLANET, band), drillHeatPerSecond(HEAT_PLANET))) -
    bandUnitsPerTick(band)
  return drillUnits === 0 ? 0 : (rise - bandUnits) / drillUnits
}

function bandUnitsPerTick(band: number): number {
  return heatUnitsPerTickOf(bandHeatPerSecond(HEAT_PLANET, band))
}

/** Holds `intent` until the body has gone `metres`, sticks, is towed or runs out; untallied. */
function holdLeg(rig: TrackedRig, intent: VehicleIntent, metres: number): void {
  const positions: Vector2[] = []
  let gone = 0
  let previous = rig.position()
  while (gone < metres && !isStuck(positions) && positions.length < ticksOf(LEG_CAP_SECONDS)) {
    for (const { position } of rig.hold(intent, 6)) {
      gone += distanceOf(position, previous)
      positions.push(position)
      previous = position
    }
  }
}

function isStuck(positions: readonly Vector2[]): boolean {
  if (positions.length <= STUCK_WINDOW_TICKS) return false
  const now = positions[positions.length - 1]
  const windowAgo = positions[positions.length - 1 - STUCK_WINDOW_TICKS]
  return distanceOf(now, windowAgo) < STUCK_UNDER_M
}

/** A rig that remembers where its body last was: the store's pose lags it between reports. */
interface TrackedRig extends Rig {
  position: () => Vector2
}

function trackedRigOf(rig: Rig): TrackedRig {
  let last = positionOfPose()
  return {
    hold: (intent, ticks) => {
      const reads = rig.hold(intent, ticks)
      last = reads.at(-1)?.position ?? last
      return reads
    },
    position: () => last,
  }
}

/** The pose the store holds for the local vehicle, planet metres: the dock on a fresh rig. */
function positionOfPose(): Vector2 {
  const pose = readLocalVehicle().pose
  if (pose === null) throw new Error('the planet has no dock')
  return { x: pose.x / MM_PER_METRE, y: pose.y / MM_PER_METRE }
}

const ticksOf = (seconds: number) => Math.round(seconds / PHYSICS_TIMESTEP)

function distanceOf(a: Vector2, b: Vector2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * A played leg as its reading: heat ticks from the carry on the charged report paths, from dig
 * time on the swept path, or drilled ticks on main's charge.
 */
function readingOf(played: ReturnType<typeof playLeg> & { gaugeHeatTicks?: number }): LegReading {
  const path = PATHS[played.pathName]
  const heatTicks = !path.isExactCarry
    ? played.drilledTicks
    : path.flags['drill.sweptCut']
      ? played.digSubSteps / SUB_STEPS_PER_TICK
      : played.carriedHeatTicks
  const seconds = played.ticks * PHYSICS_TIMESTEP
  return {
    rig: played.rigName,
    path: played.pathName,
    section: played.section,
    planet: played.planet,
    metres: played.metres,
    ticks: played.ticks,
    metresPerSecond: seconds === 0 ? 0 : played.metres / seconds,
    cells: played.cells,
    lawWork: played.lawWork,
    oneCellLaw: played.oneCellLaw,
    energy: played.energy,
    heatTicks,
    gaugeHeatTicks: played.gaugeHeatTicks ?? null,
    debtDroppedQuanta: played.debtDroppedQuanta,
    stuck: played.stuck,
  }
}

function legOf(rig: string, path: string, section: Section): LegReading {
  const found = readings.find(
    (row) => row.rig === rig && row.path === path && row.section === section,
  )
  if (found === undefined) throw new Error(`no ${rig} ${path} ${section} leg was played`)
  return found
}

/** Whether both legs cut enough ground to compare. */
function isComparable(leg: LegReading, swept: LegReading): boolean {
  return [leg, swept].every((row) => row.metres >= MIN_READ_M && row.lawWork > 0 && row.cells > 0)
}

const perLaw = (value: number, leg: LegReading) => value / leg.lawWork
const perMetre = (value: number, leg: LegReading) => value / leg.metres

/** The ratios of one leg to swept's at the same rig and ground, rounded to thousandths. */
function ratiosOf(leg: LegReading, swept: LegReading) {
  const ratio = (a: number, b: number) => Math.round((a / b) * 1000) / 1000
  return {
    energyPerLaw: ratio(perLaw(leg.energy, leg), perLaw(swept.energy, swept)),
    heatPerLaw: ratio(perLaw(leg.heatTicks, leg), perLaw(swept.heatTicks, swept)),
    lawPerMetre: ratio(perMetre(leg.lawWork, leg), perMetre(swept.lawWork, swept)),
    cellsPerMetre: ratio(perMetre(leg.cells, leg), perMetre(swept.cells, swept)),
    energyPerMetre: ratio(perMetre(leg.energy, leg), perMetre(swept.energy, swept)),
    heatPerMetre: ratio(perMetre(leg.heatTicks, leg), perMetre(swept.heatTicks, swept)),
  }
}

/** One cell of law work over the leg, as a share of swept's law work a metre: the bars' slack. */
function oneCellShareOf(leg: LegReading, swept: LegReading): number {
  return leg.oneCellLaw / leg.metres / perMetre(swept.lawWork, swept)
}

function formatTable(rows: readonly LegReading[]): string {
  const header =
    'rig | path | section | m | m/s | cells | law work | energy | heat ticks | gauge heat ticks | ' +
    'law/m | energy/law | heat/law | energy vs law | heat vs law | energy/m | heat/m | ' +
    'energy/cell | debt dropped | stuck'
  const fixed = (value: number, digits = 3) => value.toFixed(digits)
  const lines = rows.map((row) => {
    const bars = lawChargeBarsOf(row)
    return [
      row.rig,
      row.path,
      row.section,
      fixed(row.metres, 1),
      fixed(row.metresPerSecond, 2),
      row.cells,
      fixed(row.lawWork, 1),
      row.energy,
      fixed(row.heatTicks, 1),
      row.gaugeHeatTicks === null ? '-' : fixed(row.gaugeHeatTicks, 1),
      fixed(perMetre(row.lawWork, row)),
      row.lawWork === 0 ? '-' : perLaw(row.energy, row).toExponential(3),
      row.lawWork === 0 ? '-' : perLaw(row.heatTicks, row).toExponential(3),
      row.lawWork === 0 ? '-' : fixed(bars.energyRatio),
      row.lawWork === 0 ? '-' : fixed(bars.heatRatio),
      fixed(perMetre(row.energy, row), 1),
      fixed(perMetre(row.heatTicks, row), 2),
      row.cells === 0 ? '-' : fixed(row.energy / row.cells, 1),
      fixed(row.debtDroppedQuanta, 2),
      row.stuck ? 'yes' : 'no',
    ].join(' | ')
  })
  return [header, ...lines].join('\n')
}

/**
 * VS's condition on the carry: the most energy debt a tow dropped over the run, against one
 * cell's worth at the hardest cell any leg cut; more than that goes to the GD.
 */
function debtDroppedTextOf(rows: readonly LegReading[]): string {
  const most = rows.reduce(
    (top, row) => (row.debtDroppedQuanta > top.debtDroppedQuanta ? row : top),
    {
      debtDroppedQuanta: 0,
      rig: 'none',
      path: '-',
      section: '-',
    },
  )
  const oneCellQuanta =
    rows.reduce((top, row) => Math.max(top, row.oneCellLaw), 0) * QUANTA_PER_LAW_WORK
  const verdict =
    most.debtDroppedQuanta <= oneCellQuanta ? 'within one cell' : 'over one cell: to the GD'
  return (
    `max energy debt dropped at the tow: ${most.debtDroppedQuanta.toFixed(2)} quanta ` +
    `(${most.rig} ${most.path} ${most.section}; one cell is ${oneCellQuanta.toFixed(2)} quanta, ${verdict})`
  )
}

function writeReadings(rows: readonly LegReading[]): void {
  mkdirSync(REPORT_FOLDER, { recursive: true })
  const lines = rows.map((row) => JSON.stringify({ ticket: 535, ...row }))
  writeFileSync(new URL('exact-carry.ndjson', REPORT_FOLDER), `${lines.join('\n')}\n`)
}

/**
 * VS's hard charge bars for a charged leg against the analytic law value (`lawChargeBars.ts`): a
 * leg under 10 m or under 100 quanta is logged, not gated.
 */
function expectLawBars(rig: string, path: string, section: Section): void {
  const leg = legOf(rig, path, section)
  const bars = lawChargeBarsOf(leg)
  console.log(`${rig} ${path} ${section} / law: ${lawChargeTextOf(bars)}`)
  if (leg.metres < MIN_READ_M || !bars.isMeasurable) {
    console.log(`${rig} ${path} ${section}: unmeasured (under ${MIN_READ_M} m or quantized)`)
    return
  }
  expectLawCharge(bars)
}

function expectLawCharge(bars: LawChargeBars): void {
  expect(isWithinLawShare(bars.energyRatio)).toBe(true)
  expect(isUnderTankFloor(bars.energyRatio)).toBe(true)
  expect(isUnderRatchet(bars.energyRatio)).toBe(true)
  expect(isHeatAtLaw(bars)).toBe(true)
}

/**
 * The ratios to swept at the same rig and ground, printed and never gated: the charge ratios
 * amber outside 5% (swept's own charge is #540's), the geometry bars (#514's) with their verdict.
 */
function logSweptRatios(rig: string, path: string, section: Section): void {
  const leg = legOf(rig, path, section)
  const swept = legOf(rig, 'swept', section)
  if (!isComparable(leg, swept)) {
    console.log(
      `${rig} ${path} ${section} / swept: unmeasured (under ${MIN_READ_M} m or nothing cut)`,
    )
    return
  }
  const ratios = ratiosOf(leg, swept)
  const verdict = `energy ${sweptVerdictOf(ratios.energyPerLaw)}, heat ${sweptVerdictOf(ratios.heatPerLaw)}`
  console.log(`${rig} ${path} ${section} / swept (logged, ${verdict}): ${JSON.stringify(ratios)}`)
  const slack = oneCellShareOf(leg, swept)
  console.log(
    `${rig} ${path} ${section} geometry (#514's bars, reported): ${geometryVerdictOf(ratios, section, slack)}`,
  )
}

/** The absolute geometry bars as #514 reads them, for the report beside the charge bars. */
function geometryVerdictOf(
  ratios: ReturnType<typeof ratiosOf>,
  section: Section,
  slack: number,
): string {
  const lawPerMetre = ratios.lawPerMetre >= 1 - slack ? 'pass' : 'fail'
  const window = section !== 'level' || ratios.lawPerMetre <= LEVEL_WINDOW_CEILING ? 'pass' : 'fail'
  const cells = Math.abs(ratios.cellsPerMetre - 1) <= 0.05 ? 'pass' : 'fail'
  return `law/m ${lawPerMetre}, window ${window}, cells/m ${cells}`
}

/** The TD's regression gate: with the charge on or off at the same cadence the carve is the same. */
function expectSameCarve(rig: string, cadence: '@12' | '@1', section: Section): void {
  const charged = legOf(rig, `exact ${cadence}`, section)
  const main = legOf(rig, `main ${cadence}`, section)
  console.log(
    `${rig} ${cadence} ${section} charge on vs off: cells ${charged.cells}/${main.cells}, ` +
      `law ${charged.lawWork.toFixed(3)}/${main.lawWork.toFixed(3)}, ticks ${charged.ticks}/${main.ticks}`,
  )
  expect(charged.cells).toBe(main.cells)
  expect(charged.lawWork).toBe(main.lawWork)
  expect(charged.metres).toBe(main.metres)
  expect(charged.ticks).toBe(main.ticks)
}

describe('the charged report cut against the swept cut at VS rigs (ticket 535)', () => {
  for (const [rig, levels] of Object.entries(SPEED_RIGS)) {
    for (const section of ['down', 'level'] as const) {
      it(
        `plays the ${rig} rig ${section} on every path`,
        () => {
          for (const path of Object.keys(PATHS))
            readings.push(readingOf(playLeg(rig, levels, path, section)))
          expect(readings.some((row) => row.rig === rig && row.section === section)).toBe(true)
        },
        LEG_TIMEOUT_MS,
      )
      for (const path of EXACT_PATHS) {
        it(`charges and heats at the analytic law value, the ${rig} rig ${section}, ${path}`, () =>
          expectLawBars(rig, path, section))
        it(`logs the ratios to swept, amber outside 5%, the ${rig} rig ${section}, ${path}`, () =>
          logSweptRatios(rig, path, section))
      }
      for (const cadence of ['@12', '@1'] as const) {
        it(`cuts the same with the charge on or off, the ${rig} rig ${section} ${cadence}`, () =>
          expectSameCarve(rig, cadence, section))
      }
    }
  }
})

describe('the ladder, stored 1 to 200, on every path (ticket 535, Systems)', () => {
  for (const [rig, levels] of Object.entries(LADDER_RIGS)) {
    it(
      `logs law work per metre, energy and heat for ${rig} level and down`,
      () => {
        for (const section of ['down', 'level'] as const) {
          for (const path of Object.keys(PATHS))
            readings.push(readingOf(playLeg(rig, levels, path, section)))
        }
        const exact = readings.filter((row) => row.rig === rig && row.path === 'exact @12')
        expect(exact.every((row) => Number.isFinite(perMetre(row.lawWork, row)))).toBe(true)
      },
      LEG_TIMEOUT_MS,
    )
    for (const path of EXACT_PATHS) {
      for (const section of ['down', 'level'] as const) {
        it(`charges and heats at the analytic law value, ${rig} ${section}, ${path}`, () =>
          expectLawBars(rig, path, section))
        it(`logs the ratios to swept, amber outside 5%, ${rig} ${section}, ${path}`, () =>
          logSweptRatios(rig, path, section))
      }
    }
    for (const cadence of ['@12', '@1'] as const) {
      for (const section of ['down', 'level'] as const) {
        it(`cuts the same with the charge on or off, ${rig} ${section} ${cadence}`, () =>
          expectSameCarve(rig, cadence, section))
      }
    }
  }
})

describe('the charged report cut on a heat planet (ticket 535, the heat bar off the gauge)', () => {
  const rig = `planet ${HEAT_PLANET} on-curve`
  it(
    'reads the gauge on every path down 30 m of planet 8',
    () => {
      for (const path of Object.keys(PATHS)) readings.push(readingOf(playHeatLeg(path)))
      expect(readings.filter((row) => row.rig === rig)).toHaveLength(Object.keys(PATHS).length)
    },
    LEG_TIMEOUT_MS,
  )
  for (const path of EXACT_PATHS) {
    it(`heats at least the law per unit of law work off the gauge, ${path}`, () => {
      const leg = legOf(rig, path, 'down')
      const swept = legOf(rig, 'swept', 'down')
      const gauge = lawChargeBarsOf({ ...leg, heatTicks: leg.gaugeHeatTicks ?? 0 })
      const perLawOfGauge = (row: LegReading) => (row.gaugeHeatTicks ?? 0) / row.lawWork
      console.log(`${rig} ${path} gauge heat / law: ${lawChargeTextOf(gauge)}`)
      console.log(
        `${rig} ${path} gauge heat/law over swept (logged): ${perLawOfGauge(leg) / perLawOfGauge(swept)}`,
      )
      expect(isComparable(leg, swept)).toBe(true)
      expect(gauge.isMeasurable).toBe(true)
      expect(isHeatAtLaw(gauge)).toBe(true)
    })
  }
})
