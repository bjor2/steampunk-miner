/**
 * A fixed pose track through planet 1's ground, cut by the authority at a set speed, for the
 * dig-speed STOP of ticket 514 at speeds the live loop cannot reach (the body is held to 18 m/s):
 * the Vertical Scaler's 25, 44, 240 and 3600 m/s rows, flat and tilted, level and down (VS
 * 6226431087 and the A5 ruling 6226528512, quoted by the TD's v2 6226459471). The track is the TD's
 * probe cut (`scripts/bench/reportPoseRigs.ts`): 279.5 m from the centre, 10 m west of the dock
 * column; tilted, the start, the up vector and the heading turn 30 degrees round the centre. The
 * rig's law speed is the track's: the swept cut moves about 60 / D cells a second (60/23 at 23
 * ticks a cell, `sweptCutPace.test.ts`), so a track at v m/s gets the weakest drill (tip 600, the
 * probe's) whose cell in the hardest band it crosses takes at most 60 / v ticks.
 *
 * Paths, as the live loop sends them: `every tick` and `every 12` are flag-off pose reports with
 * that many drive and drill ticks, charged on the law work they removed (A6's `drill.exactCarry`)
 * and cut as they ship (the report capsule of ticket 537 at interval 1; a 12-tick report cuts
 * protocol 86's bare disc, main's cut, so `every 12` is #514's ratchet reference); `every tick,
 * disc` is the same report with `drill.reportCapsule` off, the bare disc every tick, read beside
 * it so the capsule's own move shows per row; `swept` is a `drillStep` every tick and a report
 * every 12 ticks (flag on), charged as shipped.
 * Each tick reads the drill energy (the tank's fall less the reports' drive charge) and, at each
 * report, the drill ticks it heats for (`reportedDrill.ts`).
 * The law work (`lawWorkFixtures.ts`) is read once the track is cut, from the ground before and
 * after: over every cell the track and the swept cut's lead reach, for the bars per unit of law
 * work, and over a fixed stretch of the track both paths have passed, for the bars per metre. A
 * fresh swept step cuts a whole step ahead of the body, as far as the rig's stats bound allows
 * (60 m on the strongest rig), so the stretch starts past that lead. A `CommandRejected` or a
 * tank run dry fails the run.
 */
import { DRILL_SUBSTEPS_PER_TICK } from '../../constants/balance'
import { MM_PER_METRE, TICKS_PER_SECOND, UP_VECTOR_SCALE } from '../../constants/physics'
import { blockHardness } from '../economy/oreEconomy'
import { subStepsPerTile } from '../vehicle/drillRule'
import { ENERGY_QUANTA_PER_TICK } from '../vehicle/energyQuanta'
import { stepDigTicksOf } from '../vehicle/sweptCut'
import { FACING } from '../vehicle/vehiclePose'
import type { VehicleState } from '../vehicle/vehicleState'
import type { TilePoint } from '../world/tileGrid'
import type { CommandIntent } from './authorityCommand'
import { setCasingGradeCommand } from './casingDebugCommands'
import { chargedHeatTicksOf, withDrillExactCarry, withReportCapsule } from './cutCarryFixtures'
import {
  ACROSS_MM,
  frameOf,
  hardestBandOf,
  positionAt,
  strideMmOf,
  tilesAlongTrack,
  trackTicksOf,
  type Track,
  type TrackFrame,
} from './digSpeedTrackFrame'
import { lawWorkOfChange, type LawWork } from './lawWorkFixtures'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  type ScriptedSession,
} from './scriptedSession'
import { heatThrottledDrill } from './heatRules'
import { isCutBySteps } from './sweptDrill'

export type TrackPath = 'every tick' | 'every tick, disc' | 'every 12' | 'swept'

/** What a track's cut charged, summed over its ticks. */
interface TrackCharge {
  drillEnergy: number
  heatTicks: number
}

/** One track cut on one path: its law work over all it cut and over the read stretch. */
export interface TrackRun extends TrackCharge {
  law: LawWork
  metres: number
  stretch: { law: LawWork; metres: number }
}

/** The probe rig's tip, and the drill power levels the track's rig is picked from. */
const RIG_TIP = 600
const DRILL_POWER_LEVELS = { lowest: 1, highest: 2000 }
/** The stretch read per metre: past the swept cut's 60 m lead, short of the track's end. */
const STRETCH_MM = { from: 65_000, to: 110_000 }
/** How far ahead of the body the swept cut may lead. */
const LEAD_MM = 62_000
const REPORT_EVERY = 12
/**
 * Lined at casing grade 5, as the loop lane is, so a cave-in never refills the bore (a slow track
 * lasts long enough for one) or crushes the rig; the rings land behind the stamp, past its reach.
 */
const CASING_GRADE = 5

/** Cuts the track on `path` from a fresh rig of `drillPower`, tick by tick. */
export function cutTrack(track: Track, path: TrackPath, drillPower: number): TrackRun {
  return withDrillExactCarry(isChargedAtLaw(path), () =>
    withReportCapsule(isCapsulePath(path), () => cutTrackOnPath(track, path, drillPower)),
  )
}

/**
 * The report paths are charged on the law work they removed, A6's charge (ticket 535), whose bars
 * are the reference (`lawChargeBars.ts`); it ships off until #541, so it is switched on here as the
 * charge's own lanes switch it on. The carve is the same with it on or off (A6's regression gate).
 * The swept path is charged as shipped, the parity reference for #537.
 */
function isChargedAtLaw(path: TrackPath): boolean {
  return path !== 'swept'
}

/** The report paths cut as they ship; the `disc` path switches the capsule off for the bare disc. */
function isCapsulePath(path: TrackPath): boolean {
  return path !== 'every tick, disc'
}

function cutTrackOnPath(track: Track, path: TrackPath, drillPower: number): TrackRun {
  const frame = frameOf(track)
  const session = sessionAtStart(frame, drillPower)
  const start = session.state()
  let charge: TrackCharge = { drillEnergy: 0, heatTicks: 0 }
  for (let tick = 1; tick <= trackTicksOf(track); tick++) {
    charge = addCharges(charge, cutTick(session, { frame, track, path, tick }))
  }
  const metres = (strideMmOf(track) * trackTicksOf(track)) / MM_PER_METRE
  const lawOver = (tiles: readonly TilePoint[]) =>
    lawWorkOfChange(start, session.state().world, PARAMS, 'p1', tiles)
  const reach = { from: -ACROSS_MM, to: metres * MM_PER_METRE + LEAD_MM }
  const stretch = stretchOf(track)
  const stretchLaw = { law: lawOver(stretch.tiles), metres: stretch.metres }
  return { ...charge, law: lawOver(tilesAlongTrack(frame, reach)), metres, stretch: stretchLaw }
}

/** The cells of the stretch read per metre, and its length in metres. */
export function stretchOf(track: Track): { tiles: TilePoint[]; metres: number } {
  return {
    tiles: tilesAlongTrack(frameOf(track), STRETCH_MM),
    metres: (STRETCH_MM.to - STRETCH_MM.from) / MM_PER_METRE,
  }
}

/**
 * The weakest drill power whose cell in the hardest band the track crosses takes at most 60 / speed
 * ticks, by bisection: the rig's law speed is the track's all the way along.
 */
export function drillPowerFor(track: Track): number {
  const most = (DRILL_SUBSTEPS_PER_TICK * TICKS_PER_SECOND) / track.speedMps
  const band = hardestBandOf(frameOf(track))
  let low = DRILL_POWER_LEVELS.lowest
  let high = DRILL_POWER_LEVELS.highest
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (subStepsAt(middle, band) <= most) high = middle
    else low = middle + 1
  }
  return low
}

/**
 * The rig's law time for a cell of the hardest band the track crosses, in ticks: the cell time
 * `drillPowerFor` picked the rig by, so two rigs' law work compares as geometry once each is read
 * in its own hardest-cell times (ticket 537's floor, #441's "work per metre over the rig's cell
 * time").
 */
export function hardestCellTicksFor(track: Track, drillPower: number): number {
  return subStepsAt(drillPower, hardestBandOf(frameOf(track))) / DRILL_SUBSTEPS_PER_TICK
}

function subStepsAt(drillPower: number, band: number): number {
  const vehicle = rigSession(drillPower).vehicle()
  const drill = heatThrottledDrill(PARAMS.planetIndex, vehicle)
  return subStepsPerTile(drill, blockHardness(PARAMS.planetIndex, band)) ?? Infinity
}

function rigSession(drillPower: number): ScriptedSession {
  const session = createScriptedSession()
  const levels = { drill_power: drillPower, drill_tip: RIG_TIP }
  for (const [upgradeId, level] of Object.entries(levels)) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  return session
}

function sessionAtStart(frame: TrackFrame, drillPower: number): ScriptedSession {
  const session = rigSession(drillPower)
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, setCasingGradeCommand(CASING_GRADE))
  session.submit(0, reportOf(frame, frame.start, { speedMmPerS: 0, ticks: 0 }))
  return session
}

interface TrackTick {
  frame: TrackFrame
  track: Track
  path: TrackPath
  tick: number
}

/** One tick of the path: its commands, and what they charged. */
function cutTick(session: ScriptedSession, at: TrackTick): TrackCharge {
  const to = positionAt(at.frame, at.track, at.tick)
  session.advanceTo(at.tick)
  const energyBefore = session.vehicle().energy
  let heatTicks = 0
  let movement = 0
  for (const command of commandsOf(at, to)) {
    const before = session.vehicle()
    refuseRejection(session.submit(at.tick, command), at.tick)
    if (command.type !== 'reportPose') continue
    const report = command as CommandIntent<'reportPose'>
    heatTicks += heatTicksOf(before, session.vehicle(), report, at.path)
    movement += movementQuantaOf(report)
  }
  refuseDryTank(session, at.tick)
  return { drillEnergy: energyBefore - session.vehicle().energy - movement, heatTicks }
}

function commandsOf(at: TrackTick, to: { x: number; y: number }): CommandIntent[] {
  const speedMmPerS = Math.round(at.track.speedMps * MM_PER_METRE)
  if (isReportEveryTick(at.path)) return [reportOf(at.frame, to, { speedMmPerS, ticks: 1 })]
  const report =
    at.tick % REPORT_EVERY === 0
      ? [reportOf(at.frame, to, { speedMmPerS, ticks: REPORT_EVERY })]
      : []
  if (at.path === 'every 12') return report
  return [stepOf(at.frame, to), ...report]
}

function isReportEveryTick(path: TrackPath): boolean {
  return path === 'every tick' || path === 'every tick, disc'
}

function reportOf(
  frame: TrackFrame,
  at: { x: number; y: number },
  motion: { speedMmPerS: number; ticks: number },
): CommandIntent<'reportPose'> {
  const isMoving = motion.ticks > 0
  return {
    type: 'reportPose',
    payload: {
      x: Math.round(at.x),
      y: Math.round(at.y),
      vx: Math.round((frame.heading.x / UP_VECTOR_SCALE) * motion.speedMmPerS),
      vy: Math.round((frame.heading.y / UP_VECTOR_SCALE) * motion.speedMmPerS),
      upx: frame.up.x,
      upy: frame.up.y,
      facing: frame.facing,
      driving: isMoving,
      thrusting: false,
      drilling: isMoving,
      thrustTicks: 0,
      driveTicks: motion.ticks,
      drillTicks: motion.ticks,
      drive: driveOf(frame),
    },
  }
}

function stepOf(frame: TrackFrame, at: { x: number; y: number }): CommandIntent<'drillStep'> {
  return {
    type: 'drillStep',
    payload: { x: at.x, y: at.y, facing: frame.facing, drive: driveOf(frame) },
  }
}

/** The stick the heading is held with: right on a level track, down on a down track. */
function driveOf(frame: TrackFrame) {
  return frame.facing === FACING.right
    ? { x: 1 as const, y: 0 as const }
    : { x: 0 as const, y: -1 as const }
}

/**
 * The drill ticks a report heats for, read as `reportedDrill.ts` feeds them: the swept steps'
 * summed dig time when they cut it, else the law work its charge tallied (`chargedHeatTicksOf`)
 * on a path charged at the law, else the report's own drill ticks.
 */
function heatTicksOf(
  before: VehicleState,
  after: VehicleState,
  report: CommandIntent<'reportPose'>,
  path: TrackPath,
): number {
  const cursor = before.sweptCut
  if (isCutBySteps(before) && cursor !== undefined) return stepDigTicksOf(cursor)
  if (isChargedAtLaw(path)) return chargedHeatTicksOf(before, after, movementQuantaOf(report))
  return report.payload.drillTicks
}

function movementQuantaOf({ payload }: CommandIntent<'reportPose'>): number {
  return (
    payload.thrustTicks * ENERGY_QUANTA_PER_TICK.thrust +
    payload.driveTicks * ENERGY_QUANTA_PER_TICK.drive
  )
}

function refuseRejection(events: readonly { type: string }[], tick: number): void {
  const rejected = events.find((event) => event.type === 'CommandRejected')
  if (rejected !== undefined) throw new Error(`tick ${tick} rejected: ${JSON.stringify(rejected)}`)
}

/** A fresh rig starts with a full tank; one run dry would stop cutting and read nothing. */
function refuseDryTank(session: ScriptedSession, tick: number): void {
  if (session.vehicle().energy === 0) throw new Error(`tick ${tick}: the tank ran dry`)
}

function addCharges(a: TrackCharge, b: TrackCharge): TrackCharge {
  return { drillEnergy: a.drillEnergy + b.drillEnergy, heatTicks: a.heatTicks + b.heatTicks }
}
