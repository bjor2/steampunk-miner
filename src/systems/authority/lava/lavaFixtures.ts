/**
 * The planet 8 lava pocket the lava specs touch and flood (#113): the first band-3 pocket floor of
 * the scripted seed (six lava cells wide), a hole carved under it, pose reports beside it, and
 * drilling passes under it at a set speed and report cadence (#514). Only specs use it.
 */
import { MM_PER_METRE, TICKS_PER_SECOND } from '../../../constants/physics'
import { FACING } from '../../vehicle/vehiclePose'
import { NO_DRIVE } from '../../vehicle/driveSigns'
import { isLavaAt } from '../../world/lavaFlow'
import { bandOfTile } from '../../world/planetGeometry'
import { freshPlanetParamsFor } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
import { CELL_KIND, kindOfCell } from '../../world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../world/worldState'
import type { CommandIntent } from '../authorityCommand'
import {
  createScriptedSession,
  FREEZE_ENEMIES,
  WORLD_SEED,
  type ScriptedSession,
} from '../scriptedSession'

/** The first heat planet (#113 Fire act). */
export const HEAT_PLANET = 8

export const HEAT_PARAMS = freshPlanetParamsFor(WORLD_SEED, HEAT_PLANET)

/** A band-3 lava cell above plain ground: the floor of a pocket. */
function pocketFloor(): TilePoint {
  for (let ty = 300; ty > 100; ty--) {
    for (let tx = -40; tx <= 40; tx++) {
      const isFloor =
        bandOfTile(HEAT_PARAMS, tx, ty) === 3 &&
        isLavaAt(EMPTY_WORLD, HEAT_PARAMS, { tx, ty }) &&
        kindOfCell(cellAt(EMPTY_WORLD, HEAT_PARAMS, { tx, ty: ty - 1 })) === CELL_KIND.ground &&
        kindOfCell(cellAt(EMPTY_WORLD, HEAT_PARAMS, { tx, ty: ty - 3 })) === CELL_KIND.ground
      if (isFloor) return { tx, ty }
    }
  }
  throw new Error('no lava pocket floor found')
}

export const FLOOR = pocketFloor()
export const BELOW_FLOOR = { tx: FLOOR.tx, ty: FLOOR.ty - 1 }
export const HOLE = { x: FLOOR.tx * 1000 + 500, y: BELOW_FLOOR.ty * 1000 + 500 }
/** Clear of the hole, far enough down that lava reaching the hole never touches it. */
export const AWAY = { x: HOLE.x, y: HOLE.y - 30000 }
/** The vehicle stands against the pocket's floor from below, its body 0.5 m under the lava. */
export const AGAINST_LAVA = { x: HOLE.x, y: FLOOR.ty * 1000 - 500 }

/** Player `p1` on the heat planet with its enemies frozen, so only lava acts. */
export function onHeatPlanet(): ScriptedSession {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setPlanet', payload: { planetIndex: HEAT_PLANET } })
  session.submit(0, FREEZE_ENEMIES)
  return session
}

/** An upright pose report facing up at `at`, drilling for `drillTicks` when above 0. */
export function reportAt(at: { x: number; y: number }, drillTicks = 0): CommandIntent {
  return {
    type: 'reportPose',
    payload: {
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      upx: 0,
      upy: 1024,
      facing: FACING.up,
      driving: false,
      thrusting: false,
      drilling: drillTicks > 0,
      thrustTicks: 0,
      driveTicks: 0,
      drillTicks,
      drive: NO_DRIVE,
    },
  }
}

export const carveHole: CommandIntent = {
  type: 'debug.carveCircle',
  payload: { x: HOLE.x, y: HOLE.y, radius: 950, amount: 255 },
}

/** The rig the crossing passes drive: a drill far past the floor, so any speed is in its bound. */
const CROSSING_RIG = { drill_power: 2000, drill_tip: 600 }
/** A crossing starts this far west of the pocket's floor cell and drives this far east. */
const CROSSING_START_X = (FLOOR.tx - 20) * MM_PER_METRE + MM_PER_METRE / 2
const CROSSING_LENGTH_MM = 40_000

/** A level pass east under the pocket's floor at `speedMps`, drilling, reported every `interval`. */
export function crossPocket(speedMps: number, interval: number): { burnTicks: number[] } {
  const session = crossingSession()
  const burnTicks: number[] = []
  for (let tick = interval; tick <= crossingTicksOf(speedMps); tick += interval) {
    session.advanceTo(tick)
    const events = session.submit(tick, crossingReportAt(speedMps, tick, interval))
    if (events.some((event) => event.type === 'LavaTouched')) burnTicks.push(tick)
  }
  return { burnTicks }
}

/** Whether one report at the crossing's pose for `tick` touches the lava, from a fresh session. */
export function touchesAtCrossingTick(speedMps: number, tick: number): boolean {
  const session = crossingSession()
  const events = session.submit(1, crossingReportAt(speedMps, tick, 1))
  return events.some((event) => event.type === 'LavaTouched')
}

function crossingSession(): ScriptedSession {
  const session = onHeatPlanet()
  for (const [upgradeId, level] of Object.entries(CROSSING_RIG)) {
    session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  return session
}

function crossingTicksOf(speedMps: number): number {
  return Math.ceil((CROSSING_LENGTH_MM * TICKS_PER_SECOND) / (speedMps * MM_PER_METRE))
}

function crossingReportAt(speedMps: number, tick: number, interval: number): CommandIntent {
  const { payload } = reportAt(AGAINST_LAVA, interval) as CommandIntent<'reportPose'>
  const x = Math.round(CROSSING_START_X + (speedMps * MM_PER_METRE * tick) / TICKS_PER_SECOND)
  return {
    type: 'reportPose',
    payload: {
      ...payload,
      x,
      vx: speedMps * MM_PER_METRE,
      facing: FACING.right,
      driving: true,
      driveTicks: interval,
      drive: { x: 1, y: 0 },
    },
  }
}

/** Reports drilling every `interval` ticks at `at`, for `ticks`; the ticks each burnt on. */
export function drillAgainst(
  session: ScriptedSession,
  at: { x: number; y: number },
  interval: number,
  ticks: number,
): number[] {
  const burnTicks: number[] = []
  for (let tick = interval; tick <= ticks; tick += interval) {
    session.advanceTo(tick)
    const events = session.submit(tick, reportAt(at, interval))
    if (events.some((event) => event.type === 'LavaTouched')) burnTicks.push(tick)
  }
  return burnTicks
}
