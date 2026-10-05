/**
 * Where things are for combat (#9, #11 pose addition), in integer mm: the vehicle at a tick is its
 * last reported pose carried on by its velocity for at most 12 ticks, and an enemy touches the
 * nose when it is within contact reach and in the front zone. Integer arithmetic plus `sqrt`, which
 * is exact, so a replay gives the same answers on every machine.
 */
import { COMBAT_EXTRAPOLATION_TICKS, ENEMY_CONTACT_MM } from '../../../constants/balance'
import { TICKS_PER_SECOND } from '../../../constants/physics'
import type { VehiclePose } from '../../vehicle/vehiclePose'
import type { MillimetreStep } from './combatState'
import { hitArcOf } from './hitArc'

export interface MillimetrePoint {
  x: number
  y: number
}

const CONTACT_SQ = ENEMY_CONTACT_MM * ENEMY_CONTACT_MM

export function vehiclePositionAt(
  pose: VehiclePose,
  reportTick: number,
  tick: number,
): MillimetrePoint {
  const ticks = Math.min(Math.max(0, tick - reportTick), COMBAT_EXTRAPOLATION_TICKS)
  return {
    x: pose.x + Math.trunc((pose.vx * ticks) / TICKS_PER_SECOND),
    y: pose.y + Math.trunc((pose.vy * ticks) / TICKS_PER_SECOND),
  }
}

export function distanceSq(from: MillimetrePoint, to: MillimetrePoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  return dx * dx + dy * dy
}

export function isWithinMm(from: MillimetrePoint, to: MillimetrePoint, reachMm: number): boolean {
  return distanceSq(from, to) <= reachMm * reachMm
}

export function isTouching(vehicle: MillimetrePoint, enemy: MillimetrePoint): boolean {
  return distanceSq(vehicle, enemy) <= CONTACT_SQ
}

/** In contact reach and within 45 degrees of the drill axis: pinned on the head (#9). */
export function isOnTheNose(pose: VehiclePose, vehicle: MillimetrePoint, enemy: MillimetrePoint) {
  return (
    isTouching(vehicle, enemy) &&
    hitArcOf(pose, enemy.x - vehicle.x, enemy.y - vehicle.y) === 'front'
  )
}

/** A step of at most `lengthMm` from one point toward another, truncated to whole mm. */
export function stepToward(
  from: MillimetrePoint,
  to: MillimetrePoint,
  lengthMm: number,
): MillimetreStep {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  if (distance === 0) return { x: 0, y: 0 }
  const length = Math.min(lengthMm, distance)
  return { x: Math.trunc((dx * length) / distance), y: Math.trunc((dy * length) / distance) }
}

export function stepAwayFrom(
  from: MillimetrePoint,
  away: MillimetrePoint,
  lengthMm: number,
): MillimetreStep {
  const toward = stepToward(from, away, lengthMm)
  return { x: -toward.x, y: -toward.y }
}
