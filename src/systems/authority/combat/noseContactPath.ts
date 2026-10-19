/**
 * Which enemies a drill step's nose meets (ticket 564, the TD's C2 shape on #551 6254962969 point 1,
 * on the path #570 named for it): the body's walked path, from its position at the last accepted
 * step or report to the step's pose, swept by the nose's contact test of #9 (centres within
 * `ENEMY_CONTACT_MM`, the enemy within 45 degrees of the drill axis). The pose test of the combat
 * tick sees one point a tick, so a rig that covers more than the contact reach in a tick passes an
 * enemy untouched; the path sees every enemy the nose crossed, at any speed, in walk order.
 *
 * For a point on the path the front arc is the binding test, so each enemy is tried where the arc
 * first takes it in: `along - |across|` along the path from its start, a millimetre further back
 * and clamped to the path, where `along` and `across` are its offset from the start along and
 * across the path; then at the step's pose, the pose test itself. Integer mm with `sqrt` and
 * truncation, which are exact, so a replay meets the same enemies.
 */
import type { VehiclePose } from '../../vehicle/vehiclePose'
import { isOnTheNose, type MillimetrePoint } from './combatGeometry'
import type { Enemy } from './combatState'

/**
 * How far behind the arc's edge an enemy is tried, so one on the path itself is never tried from
 * its own centre, where #9's arc test reads a zero offset as side.
 */
const ARC_INSET_MM = 1

/** The body's walked path in one drill step: where it stood, and the step's pose. */
export interface WalkedPath {
  from: MillimetrePoint
  pose: VehiclePose
}

/** The enemies the nose meets along `path`, in the order it meets them. */
export function enemiesMetAlong(enemies: readonly Enemy[], path: WalkedPath): Enemy[] {
  return enemies
    .map((enemy) => ({ enemy, along: alongWhereMet(path, enemy) }))
    .filter((met): met is { enemy: Enemy; along: number } => met.along !== null)
    .sort((a, b) => a.along - b.along)
    .map((met) => met.enemy)
}

/** How far along the path the nose meets `enemy`, in mm, or null when it never does. */
function alongWhereMet(path: WalkedPath, enemy: MillimetrePoint): number | null {
  const lengthMm = pathLengthOf(path)
  const along = firstInArcAlong(path, enemy, lengthMm)
  if (isOnTheNose(path.pose, pointAlong(path, along, lengthMm), enemy)) return along
  return isOnTheNose(path.pose, path.pose, enemy) ? lengthMm : null
}

function pathLengthOf({ from, pose }: WalkedPath): number {
  const dx = pose.x - from.x
  const dy = pose.y - from.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** Where along the path the front arc first takes the enemy in, clamped to the path. */
function firstInArcAlong({ from, pose }: WalkedPath, enemy: MillimetrePoint, lengthMm: number) {
  if (lengthMm === 0) return 0
  const dx = pose.x - from.x
  const dy = pose.y - from.y
  const ex = enemy.x - from.x
  const ey = enemy.y - from.y
  const along = (ex * dx + ey * dy) / lengthMm
  const across = Math.abs(ex * dy - ey * dx) / lengthMm
  return Math.min(lengthMm, Math.max(0, Math.trunc(along - across) - ARC_INSET_MM))
}

function pointAlong({ from, pose }: WalkedPath, along: number, lengthMm: number): MillimetrePoint {
  if (lengthMm === 0) return { x: pose.x, y: pose.y }
  return {
    x: from.x + Math.trunc(((pose.x - from.x) * along) / lengthMm),
    y: from.y + Math.trunc(((pose.y - from.y) * along) / lengthMm),
  }
}
