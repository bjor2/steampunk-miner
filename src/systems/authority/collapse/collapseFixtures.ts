/**
 * Places and moves the collapse specs share (#43), on planet 1 of the scripted session's seed:
 * cave-free band-1 rock 20 m down and band-2 rock 48 m down, a straight dig that reports a pose
 * every 12 ticks as a client would, and a weak band-2 tunnel built with the ground's debug
 * commands. Enemies are frozen so the specs see only the ground.
 */
import { FACING, type Facing } from '../../vehicle/vehiclePose'
import type { CommandIntent } from '../authorityCommand'
import { FREEZE_ENEMIES, GROUND, poseAbove, type ScriptedSession } from '../scriptedSession'

export const BAND_1_Y = 280500
export const BAND_2_Y = 252500
/** The weak tunnel's span in band 2, inside the cave-free rock round x = -34 m to -2 m. */
export const TUNNEL_FROM_X = -30000
export const TUNNEL_TO_X = -14000

const REPORT_TICKS = 12
const STEP_MM = 100

/** A pose report at `(x, y)` facing `facing`, with `drillTicks` of drilling since the last. */
export function poseAt(
  x: number,
  y: number,
  drillTicks = 0,
  facing: Facing = FACING.right,
): CommandIntent<'reportPose'> {
  const { payload } = poseAbove(GROUND, facing)
  return { type: 'reportPose', payload: { ...payload, x, y, drilling: drillTicks > 0, drillTicks } }
}

/** Frozen enemies and a drill that cuts band-2 rock quickly. */
export function prepareDigger(session: ScriptedSession, tick: number, casingGrade = 1): void {
  session.submit(tick, FREEZE_ENEMIES)
  session.submit(tick, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 8 } })
  session.submit(tick, {
    type: 'debug.setUpgrade',
    payload: { upgradeId: 'drill_power', level: 8 },
  })
  session.submit(tick, { type: 'debug.setCasingGrade', payload: { grade: casingGrade } })
}

/**
 * Drills from `fromX` to `toX` at `y`, 100 mm a report, tank and hull refilled each report so a
 * spec about the ground is never cut short by a crush; answers the tick after the last report.
 */
export function digAlong(
  session: ScriptedSession,
  firstTick: number,
  y: number,
  fromX: number,
  toX: number,
  drillTicks = REPORT_TICKS,
): number {
  const direction = toX >= fromX ? 1 : -1
  const facing = direction > 0 ? FACING.right : FACING.left
  const count = Math.floor(Math.abs(toX - fromX) / STEP_MM) + 1
  for (let at = 0; at < count; at++) {
    const tick = firstTick + at * REPORT_TICKS
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    session.submit(tick, { type: 'debug.setHull', payload: { hull: '100' } })
    session.submit(tick, poseAt(fromX + direction * at * STEP_MM, y, drillTicks, facing))
  }
  return firstTick + count * REPORT_TICKS
}

/** Reports the same pose every `every` ticks from `fromTick` to `toTick`, never drilling. */
export function parkAt(
  session: ScriptedSession,
  fromTick: number,
  toTick: number,
  x: number,
  y: number,
  every = 60,
): number {
  for (let tick = fromTick; tick <= toTick; tick += every) session.submit(tick, poseAt(x, y))
  return toTick + 1
}

/**
 * A band-2 tunnel carved and lined at grade 1 with the ground's debug commands while the vehicle
 * sits in its middle: its blocks warn as soon as the lining is laid.
 */
export function weakTunnelIntents(): CommandIntent[] {
  return [
    FREEZE_ENEMIES,
    poseAt((TUNNEL_FROM_X + TUNNEL_TO_X) / 2, BAND_2_Y),
    ...tunnelAxis().map((x): CommandIntent => ({
      type: 'debug.carveCircle',
      payload: { x, y: BAND_2_Y, radius: 950, amount: 255 },
    })),
    ...liningIntents(1),
  ]
}

export function buildWeakTunnel(session: ScriptedSession, tick: number): void {
  weakTunnelIntents().forEach((intent) => session.submit(tick, intent))
}

/** Rings every 0.5 m along the weak tunnel's axis at `grade`, as the vehicle lays them. */
export function lineTunnel(session: ScriptedSession, tick: number, grade: number): void {
  liningIntents(grade).forEach((intent) => session.submit(tick, intent))
}

function liningIntents(grade: number): CommandIntent[] {
  return tunnelAxis().map((x) => ({ type: 'debug.lineCasing', payload: { x, y: BAND_2_Y, grade } }))
}

/** The tunnel's axis every 0.5 m. */
function tunnelAxis(): number[] {
  const count = (TUNNEL_TO_X - TUNNEL_FROM_X) / 500 + 1
  return Array.from({ length: count }, (_, at) => TUNNEL_FROM_X + at * 500)
}
