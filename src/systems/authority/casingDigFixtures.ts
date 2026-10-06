/**
 * The sideways dig the casing and lining-bill specs share (#41, #76, #115): rock 12 m under the
 * surface east of the pad, cut by pose reports every 12 ticks as a client sends them, with the tank
 * refilled each report so energy never ends a dig. Enemies are frozen so the specs see only the
 * drill.
 */
import { FACING } from '../vehicle/vehiclePose'
import { FREEZE_ENEMIES, GROUND, poseAbove, type ScriptedSession } from './scriptedSession'
import { createScriptedSession } from './scriptedSession'

/** Rock 12 m under the surface east of the pad, where a sideways tunnel is cut. */
export const START = { x: 20500, y: 280500 }
export const REPORT_TICKS = 12
export const STEP_MM = 100

/** A pose report at `x` (y fixed), facing right, with `drillTicks` of drilling since the last. */
export function poseAt(x: number, drillTicks: number) {
  const { payload } = poseAbove(GROUND, FACING.right)
  return {
    type: 'reportPose' as const,
    payload: { ...payload, x, y: START.y, drilling: drillTicks > 0, drillTicks },
  }
}

/** Drives through `xs` one report apart, drilling or not, refilling the tank each report. */
export function driveThrough(
  session: ScriptedSession,
  firstTick: number,
  xs: readonly number[],
  drillTicks: number,
  reportTicks = REPORT_TICKS,
) {
  xs.forEach((x, index) => {
    const tick = firstTick + index * reportTicks
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    session.submit(tick, poseAt(x, drillTicks))
  })
  return firstTick + xs.length * reportTicks
}

export function stepsBetween(fromMm: number, toMm: number, stepMm = STEP_MM): number[] {
  const count = Math.floor(Math.abs(toMm - fromMm) / stepMm) + 1
  const direction = toMm >= fromMm ? 1 : -1
  return Array.from({ length: count }, (_, index) => fromMm + direction * index * stepMm)
}

/**
 * A 10 m dig from START at `grade` with `money` in the wallet, backing out past where it began;
 * `end` is the tick after the last report.
 */
export function digTenMetresUntil(
  grade: number,
  money: string,
  session: ScriptedSession = createScriptedSession(),
): { session: ScriptedSession; end: number } {
  session.submit(0, FREEZE_ENEMIES)
  session.submit(0, { type: 'debug.setCasingGrade', payload: { grade } })
  session.submit(0, { type: 'debug.setMoney', payload: { amount: money } })
  const dug = driveThrough(session, 0, stepsBetween(START.x, START.x + 9900), REPORT_TICKS)
  const end = driveThrough(session, dug, stepsBetween(START.x + 9900, START.x - 2200), 0)
  return { session, end }
}
