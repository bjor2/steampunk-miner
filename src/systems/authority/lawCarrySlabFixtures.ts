/**
 * The slab replay of the report cut's charge (ticket 535, A6: the reference rows of the TD shape
 * 6228682000 as VS 6228674086 and the GD 6228674068 ruled them). Every reference row is read
 * here, where a body cannot change it: one prescribed pose list per speed on planet 1's fixed seed
 * (when written the live body was held to 18 m/s and the cut jammed at 240 and 3600 m/s; #439
 * fixed the jam and the swept cut's body bound comes from the rig's stats), a flat track
 * (up along the dock column) and one tilted 30 degrees round the centre, level through band 1 or
 * down from just under the surface, fed tick by tick through the pure authority with no body, so
 * the same poses and ground go to every path:
 *
 * - `swept`: a `drillStep` every tick and a pose report every 12 (the cut by steps, the reference);
 * - `exact @12` and `exact @1`: the report cut with the charge on, a report every 12 ticks or every
 *   tick carrying that many drill and drive ticks;
 * - `main @12` and `main @1`: the same reports with the charge off, protocol 84's player path;
 * - `swept law` (ticket 540, never in `SLAB_PATHS`): `swept`'s commands with the authority's
 *   `drill.sweptLawCharge` on, the swept cut charged on the law work it removed.
 *
 * Read per run: the law work from the ground (every cell's density removed times its law time at
 * the rig's drill, `cutCarryFixtures.ts`), the drill energy (the tank's fall less the reports'
 * drive charge), the drill ticks the reports heated for (the carry's whole ticks on the charged
 * paths, the steps' summed dig time on the swept one, the drill ticks on main's), the ticks the
 * heat rule could settle of them (each report's fed ticks capped at the ticks since the gauge
 * settled, or all of them on the charged paths, which run with `heat.workUncapped` on, ticket 541,
 * `heatCapReadings.ts`; planet 1 is off the act, so the gauge itself reads 0 on every
 * path), the cells broken in order, the ground's chunks, and every `CommandRejected`. Test
 * support, never run in play.
 */
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { blockHardness } from '../economy/oreEconomy'
import { subStepsPerTile } from '../vehicle/drillRule'
import { MM_PER_METRE, TICKS_PER_SECOND, UP_VECTOR_SCALE } from '../../constants/physics'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { stepDigTicksOf } from '../vehicle/sweptCut'
import { FACING, facingVectorOf, type Facing } from '../vehicle/vehiclePose'
import { statsOfVehicle, type VehicleState } from '../vehicle/vehicleState'
import { CHUNK_SIZE, type TilePoint } from '../world/tileGrid'
import type { WorldState } from '../world/worldState'
import type { CommandIntent } from './authorityCommand'
import { vehicleOf, type AuthorityState } from './authorityState'
import { setCasingGradeCommand } from './casingDebugCommands'
import {
  brokenCellsOf,
  chargedHeatTicksOf,
  baseEnergyCarryOf,
  lawQuantumOfCommand,
  lawWorkOfGroundChanges,
  lawWorkRemovedOf,
  withDrillExactCarry,
  withHeatWorkUncapped,
  withSweptLawCharge,
} from './cutCarryFixtures'
import type { DomainEvent } from './domainEvent'
import { settleableHeatTicksOf, uncappedSettleableHeatTicksOf } from './heatCapReadings'
import { heatThrottledDrill } from './heatRules'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  type ScriptedSession,
} from './scriptedSession'
import { drillQuantumAt, stepBoundsAt } from './stepBoundRead'
import { isCutBySteps } from './sweptDrill'

export type SlabPath = 'swept' | 'swept law' | 'exact @12' | 'exact @1' | 'main @12' | 'main @1'
export const SLAB_PATHS: readonly SlabPath[] = [
  'swept',
  'exact @12',
  'exact @1',
  'main @12',
  'main @1',
]

/** Flat: up along the dock column; tilted: up turned 30 degrees round the centre. */
export type SlabTilt = 'flat' | 'tilted'
export type SlabSection = 'level' | 'down'

export interface SlabTrack {
  tilt: SlabTilt
  section: SlabSection
  /** The stride of the pose list, mm a tick: the rig's speed. */
  strideMm: number
  /** How far the track runs, mm: the section's own length when absent (short unit rows, #540). */
  lengthMm?: number
  /** The lining grade laid behind the drill: `CASING_GRADE` when absent, 0 for an unlined row. */
  casingGrade?: number
}

/** What one path read cutting one track with one rig. */
export interface SlabRun {
  ticks: number
  metres: number
  lawWork: number
  /**
   * The law work read command by command (`lawWorkOfGroundChanges`), each sample at its casing
   * grade as it stood before the command: `lawWork` with lining the run laid and cut again priced
   * at its grade (ticket 540), the reference of the swept law rows.
   */
  lawWorkCut: number
  /** The hardest cell the run cut, in law work: one cell, the bars' quantum. */
  oneCellLaw: number
  energy: number
  /** The energy carry the vehicle ends on, in the carry's numerator (`vehicle/cutCarry.ts`). */
  energyCarry: number
  heatTicks: number
  /** The drill ticks the #113 rule could settle of `heatTicks`: each report's, capped at its elapsed ticks. */
  settleableHeatTicks: number
  broken: TilePoint[]
  /** The lining samples the cut cleared, from its `CasingDrilled` events (#540's lining rows). */
  casingSamples: number
  rejections: number
  /** Each distinct refusal, `type: reason` with the command's tick, for the report. */
  refusals: string[]
  chunks: string
}

/** Up vectors, `UP_VECTOR_SCALE` long: 30 degrees is (sin, cos) x 1024, whole (authority maths). */
const UP_OF_TILT: Readonly<Record<SlabTilt, { x: number; y: number }>> = {
  flat: { x: 0, y: UP_VECTOR_SCALE },
  tilted: { x: 512, y: 887 },
}
/** Where a track starts, along the up vector and the right: level 25 m deep, down 4 m deep. */
const START_MM: Readonly<Record<SlabSection, { up: number; right: number }>> = {
  level: { up: 275_000, right: -10_000 },
  down: { up: 296_000, right: -10_000 },
}
/** A level track stays in band 1 (its chord rises to 286 m); a down one ends in band 1 too. */
const LENGTH_MM: Readonly<Record<SlabSection, number>> = { level: 160_000, down: 25_000 }
const REPORT_EVERY = 12
/** Lined behind the drill at grade 5, so a cave-in never ends a slow rig's long run. */
const CASING_GRADE = 5
/** A pose rounded to whole mm on a tilted heading lands up to this much past its stride. */
const ROUNDING_MM = 2
/** The tank is refilled this often, as the loop lane refills it, so no path is ever clamped. */
const REFILL_EVERY = 60

interface Frame {
  start: { x: number; y: number }
  up: { x: number; y: number }
  facing: Facing
  heading: { x: number; y: number }
}

function frameOf(track: SlabTrack): Frame {
  const up = UP_OF_TILT[track.tilt]
  const right = facingVectorOf(up.x, up.y, FACING.right)
  const at = START_MM[track.section]
  const start = {
    x: Math.round((up.x * at.up + right.x * at.right) / UP_VECTOR_SCALE),
    y: Math.round((up.y * at.up + right.y * at.right) / UP_VECTOR_SCALE),
  }
  const facing = track.section === 'level' ? FACING.right : FACING.down
  return { start, up, facing, heading: facingVectorOf(up.x, up.y, facing) }
}

/** The ticks the track lasts at its stride: at least 1. */
export function slabTicksOf(track: SlabTrack): number {
  return Math.max(1, Math.floor((track.lengthMm ?? LENGTH_MM[track.section]) / track.strideMm))
}

/** The stride of a rig cutting band-1 rock at `subSteps` a cell: 60 / n cells a tick. */
export function strideOfSubSteps(subSteps: number): number {
  return Math.max(1, Math.round((MM_PER_METRE * DRILL_SUBSTEPS_PER_TICK) / subSteps))
}

export function strideOfSpeedMps(speedMps: number): number {
  return Math.round((speedMps * MM_PER_METRE) / TICKS_PER_SECOND)
}

/**
 * The stride a rig of `levels` can actually step: `nominalMm` held under its cutting bound (a
 * `drillStep` past the bound is refused `invalid_pose`; `ROUNDING_MM` under it, as each pose is
 * rounded to whole mm), so the swept reference runs where the rig's stats let it; with no nominal
 * stride, the rig's own band-1 law speed.
 */
export function strideOfRig(levels: Record<string, number>, nominalMm?: number): number {
  const frame = frameOf({ tilt: 'flat', section: 'level', strideMm: 1 })
  const session = sessionAtStart(levels, frame)
  const bound = stepBoundsAt(session.state(), 'p1').cuttingMm - ROUNDING_MM
  const drill = heatThrottledDrill(PARAMS.planetIndex, session.vehicle())
  const own = strideOfSubSteps(subStepsPerTile(drill, blockHardness(PARAMS.planetIndex, 1)) ?? 1e9)
  return Math.min(nominalMm ?? own, bound)
}

function rigSession(levels: Record<string, number>): ScriptedSession {
  const session = createScriptedSession()
  for (const [upgradeId, level] of Object.entries(levels)) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  return session
}

function positionAt(frame: Frame, track: SlabTrack, tick: number) {
  const along = track.strideMm * tick
  return {
    x: Math.round(frame.start.x + (frame.heading.x / UP_VECTOR_SCALE) * along),
    y: Math.round(frame.start.y + (frame.heading.y / UP_VECTOR_SCALE) * along),
  }
}

/** The stick the heading is held with: right on a level track, down on a down track. */
function driveOf(frame: Frame) {
  return frame.facing === FACING.right
    ? { x: 1 as const, y: 0 as const }
    : { x: 0 as const, y: -1 as const }
}

function reportOf(
  frame: Frame,
  at: { x: number; y: number },
  ticks: number,
): CommandIntent<'reportPose'> {
  return {
    type: 'reportPose',
    payload: {
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      upx: frame.up.x,
      upy: frame.up.y,
      facing: frame.facing,
      driving: ticks > 0,
      thrusting: false,
      drilling: ticks > 0,
      thrustTicks: 0,
      driveTicks: ticks,
      drillTicks: ticks,
      drive: driveOf(frame),
    },
  }
}

function stepOf(frame: Frame, at: { x: number; y: number }): CommandIntent<'drillStep'> {
  return {
    type: 'drillStep',
    payload: { x: at.x, y: at.y, facing: frame.facing, drive: driveOf(frame) },
  }
}

/** The commands a path sends at `tick`, the body at `to`. */
function commandsOf(path: SlabPath, frame: Frame, to: { x: number; y: number }, tick: number) {
  if (path === 'exact @1' || path === 'main @1') return [reportOf(frame, to, 1)]
  const report = tick % REPORT_EVERY === 0 ? [reportOf(frame, to, REPORT_EVERY)] : []
  if (isSweptPath(path)) return [stepOf(frame, to), ...report]
  return report
}

function isSweptPath(path: SlabPath): boolean {
  return path === 'swept' || path === 'swept law'
}

function isChargeOn(path: SlabPath): boolean {
  return path !== 'main @12' && path !== 'main @1'
}

/**
 * Runs `play` with the authority's `drill.exactCarry` and `heat.workUncapped` (ticket 541) as
 * `path` wants them, and its `drill.sweptLawCharge` on for `swept law` alone, all put back after.
 */
function withChargeOf<T>(path: SlabPath, play: () => T): T {
  const isOn = isChargeOn(path)
  return withDrillExactCarry(isOn, () =>
    withHeatWorkUncapped(isOn, () => withSweptLawCharge(path === 'swept law', play)),
  )
}

/** What the heat rule settles of a report's fed ticks on `path`: all of them with `heat.workUncapped` on. */
function settleableOnPath(path: SlabPath, fedTicks: number, elapsedTicks: number): number {
  return isChargeOn(path)
    ? uncappedSettleableHeatTicksOf(fedTicks)
    : settleableHeatTicksOf(fedTicks, elapsedTicks)
}

/** A fresh rig of `levels` on planet 1, enemies frozen, the tank bottomless, at the track's start. */
function sessionAtStart(
  levels: Record<string, number>,
  frame: Frame,
  casingGrade = CASING_GRADE,
): ScriptedSession {
  const session = rigSession(levels)
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, setCasingGradeCommand(casingGrade))
  session.submit(0, refillOf(session.vehicle()))
  session.submit(0, reportOf(frame, frame.start, 0))
  return session
}

/** The tank filled to the rig's own capacity (`debug.setEnergy` refuses more). */
function refillOf(vehicle: VehicleState): CommandIntent<'debug.setEnergy'> {
  return { type: 'debug.setEnergy', payload: { energy: String(statsOfVehicle(vehicle).energyMax) } }
}

/** The running reads of a run, one tick at a time. */
interface RunTally {
  energy: number
  heatTicks: number
  settleableHeatTicks: number
  lawWorkCut: number
  broken: TilePoint[]
  casingSamples: number
  rejections: number
  refusals: string[]
}

/** Cuts `track` on `path` with a rig of `levels`, tick by tick, and reads what it did. */
export function cutSlab(track: SlabTrack, path: SlabPath, levels: Record<string, number>): SlabRun {
  return withChargeOf(path, () => {
    const frame = frameOf(track)
    const session = sessionAtStart(levels, frame, track.casingGrade)
    const start = session.state()
    const tally: RunTally = {
      energy: 0,
      heatTicks: 0,
      settleableHeatTicks: 0,
      lawWorkCut: 0,
      broken: [],
      casingSamples: 0,
      rejections: 0,
      refusals: [],
    }
    const ticks = slabTicksOf(track)
    for (let tick = 1; tick <= ticks; tick++) {
      session.advanceTo(tick)
      if (tick % REFILL_EVERY === 0) session.submit(tick, refillOf(session.vehicle()))
      for (const command of commandsOf(path, frame, positionAt(frame, track, tick), tick)) {
        noteCommand(tally, session, tick, command, path)
      }
    }
    const lawQuantum = isSweptPath(path) ? drillQuantumAt(start, 'p1') : DRILL_SUBSTEPS_PER_TICK
    return runOf({ start, end: session.state(), lawQuantum }, tally, track)
  })
}

/** Submits one command and tallies its charge, heat (fed and settleable), broken cells and refusal. */
function noteCommand(
  tally: RunTally,
  session: ScriptedSession,
  tick: number,
  command: CommandIntent,
  path: SlabPath,
): void {
  const was = session.state()
  const before = session.vehicle()
  const movement = command.type === 'reportPose' ? command.payload.driveTicks : 0
  const events = session.submit(tick, command)
  const after = session.vehicle()
  const fed = fedHeatTicksOf(before, after, command, path)
  tally.energy += before.energy - after.energy - movement * ENERGY_QUANTA_PER_TICK.drive
  tally.heatTicks += fed
  tally.settleableHeatTicks += settleableOnPath(path, fed, elapsedTicksOf(before, after))
  const quantum = lawQuantumOfCommand(was, command)
  tally.lawWorkCut += lawWorkOfGroundChanges(was, session.state().world, events, 'p1', quantum)
  tally.broken.push(...brokenCellsOf(events))
  tally.casingSamples += casingSamplesOf(events)
  tally.rejections += events.filter(isRejection).length
  tally.refusals.push(...events.filter(isRejection).map((event) => refusalTextOf(event, command)))
}

/** The ticks a report settled the gauge over: what the #113 rule caps its drill ticks at. */
function elapsedTicksOf(before: VehicleState, after: VehicleState): number {
  return after.heat.settledTick - before.heat.settledTick
}

function refusalTextOf(event: DomainEvent, command: CommandIntent): string {
  const reason =
    event.type === 'CommandRejected' ? `${event.reason}: ${event.problems.join('; ')}` : ''
  return `${command.type} at tick ${event.tick}, ${reason}`
}

/**
 * The drill ticks a command fed the gauge: a report's, read before and after its cut; a
 * `drillStep` feeds none (its dig time waits on the cursor for the next report), so the charge a
 * step pays is never read as heat (ticket 540: the swept rows once read a step after a report as
 * a charged report's carry).
 */
function fedHeatTicksOf(
  before: VehicleState,
  after: VehicleState,
  command: CommandIntent,
  path: SlabPath,
): number {
  if (command.type !== 'reportPose') return 0
  const movement = command.payload.driveTicks
  return (
    heatTicksBeforeOf(before, command, path) + carriedHeatTicksOf(before, after, movement, path)
  )
}

/**
 * The drill ticks a report heats for as `reportedDrill.ts` reads them before the cut: the steps'
 * summed dig time when they cut it, else (charge off) the report's drill ticks; 0 on the charged
 * path, whose heat is read from the carry after the cut.
 */
function heatTicksBeforeOf(
  vehicle: VehicleState,
  report: CommandIntent<'reportPose'>,
  path: SlabPath,
): number {
  const cursor = vehicle.sweptCut
  if (isCutBySteps(vehicle) && cursor !== undefined) return stepDigTicksOf(cursor)
  return isChargeOn(path) ? 0 : report.payload.drillTicks
}

/** The whole drill ticks the charged report heated for, read from the vehicle's carry. */
function carriedHeatTicksOf(
  before: VehicleState,
  after: VehicleState,
  movement: number,
  path: SlabPath,
): number {
  if (!isChargeOn(path) || isCutBySteps(before)) return 0
  return chargedHeatTicksOf(before, after, movement * ENERGY_QUANTA_PER_TICK.drive)
}

function casingSamplesOf(events: readonly DomainEvent[]): number {
  return events.reduce(
    (samples, event) => samples + (event.type === 'CasingDrilled' ? event.samples : 0),
    0,
  )
}

function isRejection(event: DomainEvent): boolean {
  return event.type === 'CommandRejected'
}

/**
 * A run's first and last states, and the quantum its cut's law time counts in: the rig's drill
 * quantum on a swept path (ticket 558), the base on a report's.
 */
interface RunEnds {
  start: AuthorityState
  end: AuthorityState
  lawQuantum: number
}

/** The run's reading: law work over every chunk the cut touched, read from the ground. */
function runOf({ start, end, lawQuantum }: RunEnds, tally: RunTally, track: SlabTrack) {
  const tiles = tilesOfTouchedChunks(end.world)
  const lawOf = (cut: readonly TilePoint[]) =>
    lawWorkRemovedOf(start, end.world, cut, 'p1', lawQuantum)
  const lawWork = lawOf(tiles)
  const oneCellLaw = tiles.reduce((most, tile) => Math.max(most, lawOf([tile])), 0)
  return {
    ticks: slabTicksOf(track),
    metres: (track.strideMm * slabTicksOf(track)) / MM_PER_METRE,
    lawWork,
    lawWorkCut: tally.lawWorkCut,
    oneCellLaw,
    energy: tally.energy,
    energyCarry: baseEnergyCarryOf(vehicleOf(end, 'p1')),
    heatTicks: tally.heatTicks,
    settleableHeatTicks: tally.settleableHeatTicks,
    broken: tally.broken,
    casingSamples: tally.casingSamples,
    rejections: tally.rejections,
    refusals: [...new Set(tally.refusals)].slice(0, 3),
    chunks: chunksTextOf(end.world),
  }
}

/** Every cell of every chunk the world holds a delta for. */
function tilesOfTouchedChunks(world: WorldState): TilePoint[] {
  const tiles: TilePoint[] = []
  for (const key of Object.keys(world.chunks)) {
    const [cx, cy] = key.split(',').map(Number)
    for (let ty = cy * CHUNK_SIZE; ty < (cy + 1) * CHUNK_SIZE; ty++) {
      for (let tx = cx * CHUNK_SIZE; tx < (cx + 1) * CHUNK_SIZE; tx++) tiles.push({ tx, ty })
    }
  }
  return tiles
}

/** The ground's chunks as text, without the count of edits that made them. */
function chunksTextOf(world: WorldState): string {
  return JSON.stringify(
    Object.entries(world.chunks)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, chunk]) => [key, { ...chunk, version: 0 }]),
  )
}
