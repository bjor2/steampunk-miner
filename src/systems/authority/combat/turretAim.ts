/**
 * Whom a due shot is fired at (ticket 382, the TD lock on #319), among the enemies the guns can
 * reach (`gunTargets.ts`):
 *
 * - `nearest` (#107): the nearest enemy in straight sight, ties by spawn order.
 * - `director` (Fire director): rear attackers, then latched ones, then the rest, each by nearness
 *   and then spawn order (`attackerRoles.ts`). The pick is kept for `retargetTicks` while it stays
 *   in sight, so the pack is re-ranked at most that often, never per tick.
 * - With a ricochet in the shape and no enemy in straight sight, the first enemy in the same order
 *   that one bounce reaches (`ricochet.ts`).
 *
 * Grapeshot's extra targets need their own straight line (`grapeShot.ts`), so a bounced shot hits
 * its one target.
 */
import type { TurretShape } from '../../registries/autoGuns'
import { isLatched, isRearAttacker } from './attackerRoles'
import type { DirectorPick, Enemy } from './combatState'
import { grapePartnersOf } from './grapeShot'
import { enemiesInReach, isInLineOfFire, isNearer, nearestOf, type TurretSight } from './gunTargets'
import { hasBouncePath } from './ricochet'
import type { VehicleTarget } from './vehicleTarget'

/** A due shot's targets: the one it is aimed at, then any grapeshot splits onto. */
export interface TurretAim {
  primary: Enemy
  partners: readonly Enemy[]
  /** The director's pick to keep after this shot; null for the nearest order. */
  pick: DirectorPick | null
}

/** What the shot already knows when it aims: the shape, the director's last pick, the tick. */
export interface AimContext {
  shape: TurretShape
  heldPick: DirectorPick | undefined
  tick: number
}

/** Rear attackers rank 0, latched enemies 1, every other enemy 2. */
type DirectorRank = 0 | 1 | 2

export function turretAimOf(
  sight: TurretSight,
  enemies: readonly Enemy[],
  context: AimContext,
): TurretAim | null {
  const inReach = enemiesInReach(sight, enemies)
  const inSight = inReach.filter((enemy) => isInLineOfFire(sight, enemy))
  const primary = straightPickOf(sight, inSight, context) ?? bouncedPickOf(sight, inReach, context)
  if (primary === null) return null
  return {
    primary,
    partners: partnersOf(sight, primary, inSight, context.shape),
    pick: pickToKeep(primary, context),
  }
}

function straightPickOf(
  sight: TurretSight,
  inSight: readonly Enemy[],
  context: AimContext,
): Enemy | null {
  if (context.shape.targetOrder === 'nearest') return nearestOf(sight.target.position, inSight)
  return heldPickIn(inSight, context) ?? firstInDirectorOrder(sight.target, inSight)
}

/** With a ricochet and nothing in straight sight: the first enemy one bounce reaches. */
function bouncedPickOf(
  sight: TurretSight,
  inReach: readonly Enemy[],
  { shape }: AimContext,
): Enemy | null {
  const { bounceLegCells } = shape
  if (bounceLegCells === null) return null
  return (
    inShapeOrder(sight.target, inReach, shape).find((enemy) =>
      hasBouncePath(sight, enemy, bounceLegCells),
    ) ?? null
  )
}

/** The director's last pick, while it is still in sight and its hold has not run out. */
function heldPickIn(inSight: readonly Enemy[], { heldPick, shape, tick }: AimContext) {
  if (heldPick === undefined || tick - heldPick.rankedTick >= shape.retargetTicks) return null
  return inSight.find((enemy) => enemy.id === heldPick.enemyId) ?? null
}

/** A kept pick stays as it was ranked; a new one is ranked now. Null for the nearest order. */
function pickToKeep(primary: Enemy, { shape, heldPick, tick }: AimContext): DirectorPick | null {
  if (shape.targetOrder === 'nearest') return null
  if (heldPick?.enemyId === primary.id && tick - heldPick.rankedTick < shape.retargetTicks) {
    return heldPick
  }
  return { enemyId: primary.id, rankedTick: tick }
}

function partnersOf(
  sight: TurretSight,
  primary: Enemy,
  inSight: readonly Enemy[],
  shape: TurretShape,
): readonly Enemy[] {
  return shape.grape === null ? [] : grapePartnersOf(sight, primary, inSight, shape.grape)
}

function firstInDirectorOrder(target: VehicleTarget, enemies: readonly Enemy[]): Enemy | null {
  return inDirectorOrder(target, enemies)[0] ?? null
}

function inShapeOrder(target: VehicleTarget, enemies: readonly Enemy[], shape: TurretShape) {
  return shape.targetOrder === 'director'
    ? inDirectorOrder(target, enemies)
    : [...enemies].sort((a, b) => (isNearer(target.position, a, b) ? -1 : 1))
}

/** Rear attackers first, then latched, then the rest; nearest first within each, then spawn order. */
export function inDirectorOrder(target: VehicleTarget, enemies: readonly Enemy[]): Enemy[] {
  return [...enemies].sort((a, b) => {
    const byRank = directorRankOf(target, a) - directorRankOf(target, b)
    if (byRank !== 0) return byRank
    return isNearer(target.position, a, b) ? -1 : 1
  })
}

function directorRankOf(target: VehicleTarget, enemy: Enemy): DirectorRank {
  if (isRearAttacker(target, enemy)) return 0
  return isLatched(target, enemy) ? 1 : 2
}
