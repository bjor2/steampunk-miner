/**
 * Where a hull hit came from, for its feedback (spec #678 G&V 2, ticket 720): frontal drill
 * contact sparks at the nose; a side or rear hit flashes the screen edge the enemy struck from;
 * a hit with no enemy (a collapse, a blast, heat, lava) has no side and covers the whole screen.
 * A hit that took nothing off the hull is not felt at all.
 *
 * The bearing is measured in the vehicle's local frame (clockwise from local up, as the compass
 * counts, #33), so the model never reads the camera; the presentation turns it by how the camera
 * shows local up (`screenEdgeOf`).
 */
import type { AuthorityState } from '../authority/authorityState'
import type { DomainEvent } from '../authority/domainEvent'
import { cmp, fromCanonical, ZERO_MONEY } from '../money'
import type { VehiclePose } from '../vehicle/vehiclePose'

export type HitFrom =
  | { kind: 'drillFace' }
  | { kind: 'everywhere' }
  /** Radians clockwise from local up to the enemy, as it stood when the batch ended. */
  | { kind: 'bearing'; radians: number }

export type HitEdge = 'top' | 'right' | 'bottom' | 'left'

export const HIT_EDGES: readonly HitEdge[] = ['top', 'right', 'bottom', 'left']

export interface EnemyPoint {
  id: string
  x: number
  y: number
}

/** What the local player can see of a hit: its vehicle's pose and where the enemies stand. */
export interface HitSight {
  pose: VehiclePose
  enemies: readonly EnemyPoint[]
}

type VehicleDamagedEvent = Extract<DomainEvent, { type: 'VehicleDamaged' }>

const QUARTER_TURN = Math.PI / 2

/** Null before the vehicle reported a pose, or with no such player. */
export function hitSightOf(state: AuthorityState, playerId: string): HitSight | null {
  const pose = state.players[playerId]?.vehicle.pose ?? null
  return pose === null ? null : { pose, enemies: state.combat.enemies }
}

export function didHitHurt(event: VehicleDamagedEvent): boolean {
  return cmp(fromCanonical(event.amount), ZERO_MONEY) > 0
}

/** A side or rear hit whose enemy is out of sight (gone in the same batch) covers everything. */
export function hitFromOf(event: VehicleDamagedEvent, sight: HitSight | null): HitFrom {
  if (event.arc === 'front') return { kind: 'drillFace' }
  const enemy = sight?.enemies.find((each) => each.id === event.enemyId) ?? null
  if (event.arc === null || sight === null || enemy === null) return { kind: 'everywhere' }
  return { kind: 'bearing', radians: localBearingOf(sight.pose, enemy) }
}

/** Clockwise from local up: local right is a quarter turn (`localOctantOf`'s frame). */
function localBearingOf(pose: VehiclePose, enemy: EnemyPoint): number {
  const dx = enemy.x - pose.x
  const dy = enemy.y - pose.y
  const along = dx * pose.upy - dy * pose.upx
  const upward = dx * pose.upx + dy * pose.upy
  return Math.atan2(along, upward)
}

/**
 * The screen edge a bearing points at, once the camera shows local up `localUpScreenAngle`
 * radians counter-clockwise from screen up (`cameraPresence`; 0 in the settled rotating camera).
 */
export function screenEdgeOf(bearingRadians: number, localUpScreenAngle: number): HitEdge {
  const screenBearing = bearingRadians - localUpScreenAngle
  const quarter = Math.round(screenBearing / QUARTER_TURN)
  return HIT_EDGES[((quarter % 4) + 4) % 4]
}
