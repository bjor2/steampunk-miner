/**
 * Concussion shells (ticket 382, Content's table on #310): a hit pushes the enemy `cells` back
 * along the shot and breaks its lunge, once per enemy per `cooldownTicks`. Damage is unchanged.
 *
 * The cooldown is the enemy's optional `knockedTick` (the TD lock on #319 offered `readyTick` or a
 * field). `readyTick` would have mixed the last knock with the last attack, and a fresh spawn's
 * `readyTick` is its spawn tick. A broken lunge ends as a lunge that misses does: the enemy closes
 * in again and waits out its attack cooldown. A wind-up is only pushed, so a knock never cancels
 * the next attack and, with Systems' 90-tick floor (the slowest attack cooldown), never stun-locks.
 * A pinned enemy sits on the drill and is never knocked off it.
 *
 * The push moves in quarter-tile samples and stops before the first cell the enemy's kind may not
 * enter, as a recoil stops (`enemyMovement.ts`); it cuts no cell.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { enemyBoundedStats } from '../../economy/enemyStats'
import type { TurretKnock } from '../../registries/autoGuns'
import { stepToward, type MillimetrePoint } from './combatGeometry'
import { inPhase, type Enemy } from './combatState'
import { canEnter, type Terrain } from './enemyMovement'

const SAMPLES_PER_CELL = 4

/** The enemy after a hit from a rig at `from`: knocked back when its knock is ready. */
export function knockedEnemy(
  terrain: Terrain,
  from: MillimetrePoint,
  enemy: Enemy,
  knock: TurretKnock,
  tick: number,
): Enemy {
  if (!isKnockReady(enemy, knock, tick)) return enemy
  return {
    ...withLungeBroken(enemy, tick),
    ...pushedBack(terrain, from, enemy, knock.cells),
    knockedTick: tick,
  }
}

function isKnockReady(enemy: Enemy, knock: TurretKnock, tick: number): boolean {
  const { knockedTick } = enemy
  if (enemy.phase === 'pinned') return false
  return knockedTick === undefined || tick - knockedTick >= knock.cooldownTicks
}

/** A lunge ends as if it missed: the enemy closes in again after its attack cooldown. */
function withLungeBroken(enemy: Enemy, tick: number): Enemy {
  if (enemy.phase !== 'lunge') return enemy
  const { attackCooldownTicks } = enemyBoundedStats(enemy.kind, enemy.tier)
  return { ...inPhase(enemy, 'approach', tick), readyTick: tick + attackCooldownTicks }
}

/** The furthest enterable point up to `cells` from the enemy, straight away from the rig. */
function pushedBack(
  terrain: Terrain,
  from: MillimetrePoint,
  enemy: Enemy,
  cells: number,
): MillimetrePoint {
  const push = stepToward(from, enemy, cells * MM_PER_METRE)
  const samples = cells * SAMPLES_PER_CELL
  let reached: MillimetrePoint = { x: enemy.x, y: enemy.y }
  for (let sample = 1; sample <= samples; sample++) {
    const next = {
      x: enemy.x + Math.trunc((push.x * sample) / samples),
      y: enemy.y + Math.trunc((push.y * sample) / samples),
    }
    if (!canEnter(terrain, enemy.kind, next)) break
    reached = next
  }
  return reached
}
