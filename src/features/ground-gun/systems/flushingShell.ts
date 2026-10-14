/**
 * The Flushing shell (ticket 388 through ticket 386's `enemyFlushes` registry; Content's node table
 * on #310): when a burrower tunnels within `flushRange` cells of an exposed face, a shell thumps
 * that face and the burrower surfaces within `flushTicks`, to be engaged normally. It alters no
 * cell and damages nothing: the kernel walks the burrower out (`combat/burrowerFlush.ts`).
 *
 * Only the turret of the vehicle the burrower hunts fires the shell, while that turret is live
 * (`turretModules.ts`), on Auto and out on a trip, and the burrower is inside its range. A shell
 * thumps every `flushCooldownTicks` and its shiver lasts `flushTicks` from the thump, so the answer
 * is the shiver's ticks left. The answer never lets the burrower look past `flushRange` cells for
 * its face: the kernel's face must lie within the answer's ticks of walking, so the answer is cut to
 * the ticks the burrower walks `flushRange` tiles in. Derived from the tick and the turret alone, so
 * there is nothing to save.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { distanceSq } from '../../../systems/authority/combat/combatGeometry'
import type { Enemy } from '../../../systems/authority/combat/combatState'
import { walkStepMmOf } from '../../../systems/authority/combat/enemyMovement'
import { BASE_TURRET_SHAPE } from '../../../systems/authority/combat/turretShape'
import { vehicleTargetOf } from '../../../systems/authority/combat/vehicleTarget'
import type { EnemyFlush } from '../../../systems/registries/enemyFlushes'
import { isGunOnAuto } from '../../../systems/vehicle/vehicleGun'
import { moduleStatsAt, type ModuleStats } from './armouryModules'
import { FLUSHING_SHELL_ITEM_ID } from './autoGunsLane'
import { isOnTurretMount, liveTurretModuleMarkOf, type TurretAttachRead } from './turretModules'
import { playerTurretShapeOf } from './turretShapes'

/** The shipped flush: the mount table says whether the shell's cradle hangs on the turret. */
export const FLUSHING_SHELL_FLUSH: EnemyFlush = flushingShellOf(isOnTurretMount)

/** A flush reading attachment through `isAttached` (a spec's missing mount, for one). */
export function flushingShellOf(isAttached: TurretAttachRead): EnemyFlush {
  return {
    id: 'ground-gun.flushing-shell',
    flushTicksOf: (enemy, state, tick) => shellFlushTicksOf(enemy, state, tick, isAttached),
  }
}

/** Ticks the hunted vehicle's shell gives the burrower to surface now; null for no shell. */
export function shellFlushTicksOf(
  enemy: Enemy,
  state: AuthorityState,
  tick: number,
  isAttached: TurretAttachRead = isOnTurretMount,
): number | null {
  const mark = firingShellMarkOf(state, enemy, tick, isAttached)
  if (mark === 0) return null
  return shiverAnswerOf(enemy, moduleStatsAt(FLUSHING_SHELL_ITEM_ID, mark).stats, tick)
}

/** The shiver's ticks left since the last thump, cut to the walk of `flushRange`; null when over. */
function shiverAnswerOf(enemy: Enemy, stats: ModuleStats, tick: number): number | null {
  const shiverLeft = stats.flushTicks - (tick % stats.flushCooldownTicks)
  const answer = Math.min(shiverLeft, reachTicksOf(enemy, stats.flushRange))
  return answer >= 1 ? answer : null
}

/** The shell's Mark when the hunted vehicle's turret can fire it at the burrower; 0 otherwise. */
function firingShellMarkOf(
  state: AuthorityState,
  enemy: Enemy,
  tick: number,
  isAttached: TurretAttachRead,
): number {
  const playerId = enemy.ownerId
  if (!Object.hasOwn(state.players, playerId)) return 0
  const mark = liveTurretModuleMarkOf(state, playerId, FLUSHING_SHELL_ITEM_ID, isAttached)
  if (mark === 0 || !isGunOnAuto(vehicleOf(state, playerId).gun)) return 0
  return isInTurretRange(state, playerId, enemy, tick, isAttached) ? mark : 0
}

function isInTurretRange(
  state: AuthorityState,
  playerId: string,
  enemy: Enemy,
  tick: number,
  isAttached: TurretAttachRead,
): boolean {
  const target = vehicleTargetOf(state, playerId, tick)
  if (target === null) return false
  const shape = playerTurretShapeOf(state, playerId, isAttached) ?? BASE_TURRET_SHAPE
  const rangeMm = shape.rangeTiles * MM_PER_METRE
  return distanceSq(target.position, enemy) <= rangeMm * rangeMm
}

/** The whole ticks the burrower walks `flushRange` tiles in. */
function reachTicksOf(enemy: Enemy, flushRange: number): number {
  return Math.floor((flushRange * MM_PER_METRE) / walkStepMmOf(enemy))
}
