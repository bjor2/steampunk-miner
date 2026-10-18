/**
 * The event-stream replay of ticket 514 (Done-when 6, the TD's "Event-stream test", the Horizontal
 * Scaler's bar (b)): one fixed per-tick pose track cut by pose reports every tick and every 12
 * ticks, the way the flag-off client sends them (every tick with the exact carry on, as interval 1
 * is live, ticket 537), and the cells each cut in the order it cut them.
 * Tracks run level east, level on a 30-degree tilt, or east then turning down, through rock 12 m
 * under planet 1's surface. Drill gear comes as fakes through `withRegistrations`, so no slice is
 * imported. Only specs use it.
 */
import { MM_PER_METRE, TICKS_PER_SECOND, UP_VECTOR_SCALE } from '../../constants/physics'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { withRegistrations } from '../../registries/registrar'
import type { DrillGearAsk } from '../economy/drillGearCaps'
import type { DriveSigns } from '../vehicle/driveSigns'
import { FACING, facingVectorOf, type Facing } from '../vehicle/vehiclePose'
import type { TilePoint } from '../world/tileGrid'
import type { CommandIntent } from './authorityCommand'
import { withDrillExactCarry } from './cutCarryFixtures'
import type { DomainEvent } from './domainEvent'
import { drillGearOf } from './gatedBiteFixtures'
import { createScriptedSession, FREEZE_ENEMIES, poseAbove } from './scriptedSession'

export type StreamTrack = 'straight' | 'tilted' | 'turn'

/** A drill gear ask and the stick it is held with (the twin bit cuts ahead only when pushed). */
export interface StreamGear {
  name: string
  ask: DrillGearAsk | null
  drive: DriveSigns
}

export interface StreamRun {
  track: StreamTrack
  speedMps: number
  levels: Readonly<Record<string, number>>
  gear: StreamGear
  /** Extra fakes, such as a gate on a cell of the track. */
  slices?: readonly SliceDefinition[]
}

/**
 * What one cadence cut: the cells in the order they fell, every event the reports answered, and
 * the cells the track's last report cut.
 */
export interface CutStream {
  cells: string[]
  events: DomainEvent[]
  lastReportCells: string[]
}

/** A rig whose drill clears every sample its stamp reaches inside one tick. */
export const CLEARING_RIG = { drill_power: 106, drill_tip: 600 }
export const STREAM_TICKS = 480
const TURN_TICK = 240
const REPORT_EVERY = 12
/** Rock 12 m under the surface east of the pad (`casingDigFixtures.ts`), 281.2 m from the centre. */
const START_MM = { x: 20_500, y: 280_500 }
const START_RADIUS_MM = 281_249
/** 30 degrees round the centre: (sin, cos) x 1024, whole. */
const TILTED_UP = { x: 512, y: 887 }
const LEVEL_UP = { x: 0, y: UP_VECTOR_SCALE }

export const BARE_BIT: StreamGear = { name: 'bare bit', ask: null, drive: { x: 1, y: 0 } }
export const STREAM_GEARS: readonly StreamGear[] = [
  BARE_BIT,
  { name: 'side cells', ask: { sideCells: 1 }, drive: { x: 1, y: 0 } },
  { name: 'reach boom', ask: { aheadCells: 2 }, drive: { x: 1, y: 0 } },
  { name: 'twin bit', ask: { aheadCells: 1, aheadAim: 'drive' }, drive: { x: 1, y: -1 } },
]

/**
 * The track cut every tick and every 12 ticks, each from a fresh session: every tick with the
 * exact carry on, the one configuration interval 1 is live in (TD 6236464931) and the report
 * capsule cuts in (ticket 537); every 12 ticks as the game ships, main's stream.
 */
export function cutAtBothCadences(run: StreamRun): { everyTick: CutStream; every12: CutStream } {
  const slices = [
    ...(run.gear.ask === null ? [] : [drillGearOf(run.gear.ask)]),
    ...(run.slices ?? []),
  ]
  const cut = (interval: number) => () => cutStream(run, interval)
  return {
    everyTick: withRegistrations(slices, () => withDrillExactCarry(true, cut(1))),
    every12: withRegistrations(slices, cut(REPORT_EVERY)),
  }
}

/** The track cut every `interval` ticks with the slices registered now. */
export function cutStream(run: StreamRun, interval: number): CutStream {
  const session = createScriptedSession()
  session.submit(0, FREEZE_ENEMIES)
  for (const [upgradeId, level] of Object.entries(run.levels)) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  session.submit(0, reportAt(run, 0, 0))
  const events: DomainEvent[] = []
  let lastReport: DomainEvent[] = []
  for (let tick = interval; tick <= STREAM_TICKS; tick += interval) {
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    lastReport = session.submit(tick, reportAt(run, tick, interval))
    events.push(...lastReport)
  }
  return { cells: destroyedCellsOf(events), events, lastReportCells: destroyedCellsOf(lastReport) }
}

function destroyedCellsOf(events: readonly DomainEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === 'TileDestroyed' ? [cellKey({ tx: event.tx, ty: event.ty })] : [],
  )
}

export function cellKey({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}

function reportAt(run: StreamRun, tick: number, ticks: number): CommandIntent<'reportPose'> {
  const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.right)
  const up = run.track === 'tilted' ? TILTED_UP : LEVEL_UP
  const at = positionAt(run, tick)
  return {
    type: 'reportPose',
    payload: {
      ...payload,
      x: Math.round(at.x),
      y: Math.round(at.y),
      upx: up.x,
      upy: up.y,
      facing: facingAt(run.track, tick),
      driving: ticks > 0,
      drilling: ticks > 0,
      driveTicks: ticks,
      drillTicks: ticks,
      drive: run.gear.drive,
    },
  }
}

function facingAt(track: StreamTrack, tick: number): Facing {
  return track === 'turn' && tick > TURN_TICK ? FACING.down : FACING.right
}

/** The body's centre at `tick`, mm: the start moved along each tick's heading at the track's speed. */
export function positionAt(run: StreamRun, tick: number): { x: number; y: number } {
  const strideMm = (run.speedMps * MM_PER_METRE) / TICKS_PER_SECOND
  const up = run.track === 'tilted' ? TILTED_UP : LEVEL_UP
  const start = run.track === 'tilted' ? startOnUp(up) : START_MM
  const level = facingVectorOf(up.x, up.y, FACING.right)
  const down = facingVectorOf(up.x, up.y, FACING.down)
  const levelTicks = run.track === 'turn' ? Math.min(tick, TURN_TICK) : tick
  const downTicks = tick - levelTicks
  return {
    x: start.x + ((level.x * levelTicks + down.x * downTicks) * strideMm) / UP_VECTOR_SCALE,
    y: start.y + ((level.y * levelTicks + down.y * downTicks) * strideMm) / UP_VECTOR_SCALE,
  }
}

function startOnUp(up: { x: number; y: number }): { x: number; y: number } {
  return {
    x: (up.x * START_RADIUS_MM) / UP_VECTOR_SCALE,
    y: (up.y * START_RADIUS_MM) / UP_VECTOR_SCALE,
  }
}
