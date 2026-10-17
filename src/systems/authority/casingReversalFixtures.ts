/**
 * A rig cutting back over its own trail, as a session (ticket 538, the TD ruling 6228998310 on
 * #538): the sideways dig the casing specs share (`casingDigFixtures.ts`) runs 8 m east, the rig
 * turns and drives 4 m back the way it came with the drill still biting, then backs out to where
 * it began with the drill off, so every waiting ring is laid. Each report on the way back reads
 * the trail before and after it: the points that left it are the rings laid (`CasingPlaced`
 * carries no position), held against the stamp's centre at that pose.
 */
import { CASING_RING_LAG_MM } from '../../constants/balance'
import { drillStampOf } from '../vehicle/drillStamp'
import type { RingPoint } from '../vehicle/casingTrail'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import { chunkOfSample, localSampleOf, MM_PER_SAMPLE, sampleIndexOf } from '../world/sampleGrid'
import { currentCasingOfChunk } from '../world/worldState'
import { REPORT_TICKS, START, stepsBetween } from './casingDigFixtures'
import type { DomainEvent } from './domainEvent'
import { FREEZE_ENEMIES, GROUND, poseAbove, type ScriptedSession } from './scriptedSession'

export const FORWARD_MM = 8000
export const BACK_MM = 4000
/**
 * The way back from `fromMm` along the dig, `offsetMm` up from the bore's axis: 0 runs in the
 * bore, 300 grazes its wall.
 */
export interface WayBack {
  fromMm: number
  backMm: number
  offsetMm: number
}

export const IN_THE_BORE: WayBack = { fromMm: FORWARD_MM, backMm: BACK_MM, offsetMm: 0 }
export const GRAZING_THE_WALL: WayBack = { ...IN_THE_BORE, offsetMm: 300 }
/** No way back: the plain dig the reversal is billed against. */
export const STRAIGHT_DIG: WayBack = { ...IN_THE_BORE, backMm: 0 }

/** The rings a way back laid, and those of them laid inside the lag of the stamp's centre. */
export interface WayBackRings {
  laid: number
  insideLag: RingPoint[]
}

/** The reversal run: its session, the rings the way back laid and its events. */
export interface Reversal {
  session: ScriptedSession
  rings: WayBackRings
  wayBackEvents: DomainEvent[]
}

/** One report at (x, y), refilling the tank first, as `casingDigFixtures.driveThrough` does. */
function reportAt(
  session: ScriptedSession,
  tick: number,
  at: { x: number; y: number; facing: Facing },
  drillTicks: number,
): void {
  const { payload } = poseAbove(GROUND, at.facing)
  const pose = { ...payload, x: at.x, y: at.y, drilling: drillTicks > 0, drillTicks }
  session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
  session.submit(tick, { type: 'reportPose', payload: pose })
}

export function startReversal(session: ScriptedSession): void {
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, { type: 'debug.setMoney', payload: { amount: '100000' } })
}

/** The 8 m dig east, facing right, the drill biting every report; the tick after it. */
export function digForward(session: ScriptedSession): number {
  return driveAlong(session, 0, stepsBetween(START.x, START.x + FORWARD_MM), FACING.right)
}

/** The way back facing left, the drill biting; the rings it laid and the tick after it. */
export function cutBack(
  session: ScriptedSession,
  firstTick: number,
  wayBack: WayBack,
): { rings: WayBackRings; end: number } {
  const xs =
    wayBack.backMm === 0 ? [] : stepsBetween(START.x + wayBack.fromMm, wayBackEndOf(wayBack))
  const laid = xs.map((x, index) => {
    const at = { x, y: START.y + wayBack.offsetMm, facing: FACING.left }
    return ringsLaidByReport(session, firstTick + index * REPORT_TICKS, at)
  })
  return { rings: ringsOf(laid), end: firstTick + xs.length * REPORT_TICKS }
}

function wayBackEndOf(wayBack: WayBack): number {
  return START.x + wayBack.fromMm - wayBack.backMm
}

/** One report's rings: the points that left the trail, and the stamp's centre they were laid at. */
interface ReportRings {
  points: RingPoint[]
  stamp: RingPoint
}

function ringsLaidByReport(
  session: ScriptedSession,
  tick: number,
  at: { x: number; y: number; facing: Facing },
): ReportRings {
  const before = session.vehicle().casingTrail.unlined
  reportAt(session, tick, at, REPORT_TICKS)
  const after = session.vehicle().casingTrail.unlined
  const stamp = drillStampOf(session.vehicle().pose!, false)
  const points = before.filter((point) => !after.some((kept) => isSamePoint(kept, point)))
  return { points, stamp: { xMm: stamp.xMm, yMm: stamp.yMm } }
}

function ringsOf(reports: readonly ReportRings[]): WayBackRings {
  return {
    laid: reports.reduce((sum, report) => sum + report.points.length, 0),
    insideLag: reports.flatMap(({ points, stamp }) =>
      points.filter((point) => isInsideLag(point, stamp)),
    ),
  }
}

function isInsideLag(point: RingPoint, stamp: RingPoint): boolean {
  const dx = point.xMm - stamp.xMm
  const dy = point.yMm - stamp.yMm
  return dx * dx + dy * dy < CASING_RING_LAG_MM * CASING_RING_LAG_MM
}

function isSamePoint(a: RingPoint, b: RingPoint): boolean {
  return a.xMm === b.xMm && a.yMm === b.yMm
}

/** Back out on the bore's axis to 3 m west of where the dig began, the drill off. */
export function backOut(session: ScriptedSession, firstTick: number, wayBack: WayBack): number {
  const xs = stepsBetween(wayBackEndOf(wayBack), START.x - 3000)
  return xs.reduce((tick, x) => {
    reportAt(session, tick, { x, y: START.y, facing: FACING.right }, 0)
    return tick + REPORT_TICKS
  }, firstTick)
}

function driveAlong(
  session: ScriptedSession,
  firstTick: number,
  xs: readonly number[],
  facing: Facing,
): number {
  return xs.reduce((tick, x) => {
    reportAt(session, tick, { x, y: START.y, facing }, REPORT_TICKS)
    return tick + REPORT_TICKS
  }, firstTick)
}

/** The axis length the run was billed for: the sum of `CasingLined` stretches, in mm. */
export function chargedLiningMmOf(session: ScriptedSession): number {
  return session
    .events()
    .reduce((sum, event) => (event.type === 'CasingLined' ? sum + event.lengthMm : sum), 0)
}

/** The ground read: 2.5 m either side of the axis, from 3 m behind the dig's start to 3 m past. */
const WALL_READ_MM = { from: -3000, to: FORWARD_MM + 3000, across: 2500 }

/** Lined samples of the read, and the bore's unique lined length: lined sample columns x 250. */
export interface LinedWall {
  cells: number
  uniqueLinedMm: number
}

export function linedWallOf(session: ScriptedSession): LinedWall {
  const world = session.state().world
  const columns = new Set<number>()
  let cells = 0
  for (const { sx, sy } of wallReadSamples()) {
    const casing = currentCasingOfChunk(world, chunkOfSample(sx), chunkOfSample(sy))
    if (casing[sampleIndexOf(localSampleOf(sx), localSampleOf(sy))] === 0) continue
    columns.add(sx)
    cells++
  }
  return { cells, uniqueLinedMm: columns.size * MM_PER_SAMPLE }
}

function wallReadSamples(): { sx: number; sy: number }[] {
  const y0 = Math.floor((START.y - WALL_READ_MM.across) / MM_PER_SAMPLE)
  const x0 = Math.floor((START.x + WALL_READ_MM.from) / MM_PER_SAMPLE)
  const rows = Math.floor((2 * WALL_READ_MM.across) / MM_PER_SAMPLE)
  const columns = Math.floor((WALL_READ_MM.to - WALL_READ_MM.from) / MM_PER_SAMPLE)
  return Array.from({ length: rows * columns }, (_, index) => ({
    sx: x0 + (index % columns),
    sy: y0 + Math.floor(index / columns),
  }))
}
