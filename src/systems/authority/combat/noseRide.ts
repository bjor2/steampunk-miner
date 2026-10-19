/**
 * Nose contact (ticket 564, C2 of #551: the TD's shape 6254962969 with the VS's amendment 6254978633
 * and the HS's conditions 6254968595, under the GD's amendment 3 6254960306), behind the authority
 * dev flag `drill.noseContact`:
 *
 * - **Engagement, inside `drillStep`**: after the step's cut, every enemy its nose met along the
 *   body's walked path (`noseContactPath.ts`) is engaged, in walk order: drill damage still pending
 *   from a pin is logged, it is pinned to the nose and rides it, and it takes its first tick of
 *   damage there. Its dwell is `max(1, ceil(health * 60 / enemyDamageRate))` ticks from its health
 *   then (`noseDwellTicks`), with no speed input, so the time to kill is the same at 5 and 84 m/s and
 *   an under-tier enemy dies on the tick it is met.
 * - **Riding, on the clock**: each later tick a rider is carried at its rider's nose and takes the
 *   same tick of damage, and it dies, killed by the drill and credited to the player who engaged it,
 *   on the last tick of its dwell. It takes no action of its own from the engagement on (the TD's
 *   ruling on ore_thief: a theft must complete before the nose meets the thief), and the pin and the
 *   nose-tile burrower rule leave it alone, so it is never damaged twice.
 * - **Holding** (`noseHold.ts`): an enemy tougher than the rig, by the ground gates' own comparison
 *   (the rig's gate tip cannot scratch the rock its tier was made for, `enemyRockHardness`), or a
 *   kind `enemies.holdsTheRig` names (the wrecker, the core guardian), holds the cut for its dwell
 *   instead of riding along, then dies the same way. It is no gate: no `DrillGated`, no carry
 *   discarded, no gate state touched.
 *
 * With the flag off no enemy is engaged, and contact is #9's pose-only pin.
 */
import { MM_PER_METRE, UP_VECTOR_SCALE } from '../../../constants/physics'
import { enemyRockHardness, isRigHolderKind, noseDwellTicks } from '../../economy/enemyStats'
import { canScratch } from '../../vehicle/drillRule'
import { facingVectorOf, type VehiclePose } from '../../vehicle/vehiclePose'
import { statsOfVehicle } from '../../vehicle/vehicleState'
import { vehicleOf, withCombat, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import { flagsOf } from '../devFlagState'
import type { MillimetrePoint } from './combatGeometry'
import { combatVehicleOf, enemyById, inPhase, withEnemy, type Enemy } from './combatState'
import { drillRidingEnemy, flushDrillDamage, killEnemy } from './enemyDamage'
import { enemyDamageRate } from './enemyDamageRate'
import { enemiesMetAlong, type WalkedPath } from './noseContactPath'
import { vehicleTargetOf } from './vehicleTarget'

/** A drill step's cut, then every enemy its nose met along `path` engaged, in walk order. */
export function engageEnemiesOnPath(
  drilled: RuleEffect,
  playerId: string,
  path: WalkedPath,
): RuleEffect {
  if (!flagsOf(drilled.state)['drill.noseContact']) return drilled
  const met = enemiesMetAlong(unengagedEnemiesOf(drilled.state), path)
  const engaged = chainEffects(
    drilled.state,
    met.map((enemy) => (current) => engageEnemy(current, enemy.id, playerId, path.pose)),
  )
  return { state: engaged.state, events: [...drilled.events, ...engaged.events] }
}

/** One tick of a rider on the clock: carried at its rider's nose, drilled, and dead at its end. */
export function rideTheNose(state: AuthorityState, enemy: Enemy, tick: number): RuleEffect {
  return chainEffects(state, [
    (current) => unchanged(withRiderAtNose(current, enemy.id, tick)),
    (current) => drillRiderOnce(current, enemy.id, tick),
  ])
}

/** The player a clock-caused event of `enemy` concerns: its rider's, else the hunted vehicle's. */
export function creditedPlayerOf(enemy: Enemy): string {
  return enemy.ride?.by ?? enemy.ownerId
}

/** Whether a rider holds its rider's cut: a holder kind, or tougher than the rig's gate tip. */
export function isHoldingRide(state: AuthorityState, enemy: Enemy): boolean {
  if (enemy.ride === undefined) return false
  if (isRigHolderKind(enemy.kind)) return true
  const { gateTip } = statsOfVehicle(vehicleOf(state, enemy.ride.by))
  return !canScratch(gateTip, enemyRockHardness(enemy.tier))
}

function unengagedEnemiesOf(state: AuthorityState): Enemy[] {
  return state.combat.enemies.filter((enemy) => enemy.ride === undefined)
}

function engageEnemy(
  state: AuthorityState,
  enemyId: string,
  playerId: string,
  pose: VehiclePose,
): RuleEffect {
  return chainEffects(state, [
    (current) => flushDrillDamage(current, enemyId, 'front'),
    (current) => unchanged(withRideStarted(current, enemyId, playerId, nosePointOf(pose))),
    (current) => drillRiderOnce(current, enemyId, state.tick),
  ])
}

/** Pinned to the nose at `nose`, riding until the last tick of its dwell. */
function withRideStarted(
  state: AuthorityState,
  enemyId: string,
  playerId: string,
  nose: MillimetrePoint,
): AuthorityState {
  const enemy = enemyById(state.combat, enemyId) as Enemy
  const dwell = noseDwellTicks(enemy.health, enemyDamageRate(state, playerId))
  const ride = { by: playerId, untilTick: state.tick + dwell - 1 }
  const riding = { ...inPhase(enemy, 'pinned', state.tick), ...nose, ride }
  return withCombat(state, withEnemy(state.combat, riding))
}

/** One tick of the rider's drill on it; on its last tick it dies if the drill has not killed it. */
function drillRiderOnce(state: AuthorityState, enemyId: string, tick: number): RuleEffect {
  const enemy = enemyById(state.combat, enemyId)
  if (enemy?.ride === undefined) return unchanged(state)
  const riderId = enemy.ride.by
  return chainEffects(state, [
    (current) => drillRidingEnemy(current, enemy, riderId, tick),
    (current) => endRideAt(current, enemyId, tick),
  ])
}

function endRideAt(state: AuthorityState, enemyId: string, tick: number): RuleEffect {
  const enemy = enemyById(state.combat, enemyId)
  if (enemy?.ride === undefined || tick < enemy.ride.untilTick) return unchanged(state)
  return killEnemy(state, enemy, 'front', tick, 'drill')
}

/** The rider carried to where its rider's nose is at `tick`; left where it was with no rig. */
function withRiderAtNose(state: AuthorityState, enemyId: string, tick: number): AuthorityState {
  const enemy = enemyById(state.combat, enemyId)
  if (enemy?.ride === undefined) return state
  const pose = latestPoseOf(state, enemy.ride.by, tick)
  if (pose === null) return state
  return withCombat(state, withEnemy(state.combat, { ...enemy, ...nosePointOf(pose) }))
}

/**
 * The rig as an enemy sees it at `tick` (`vehicleTarget.ts`), turned to its last drill step's
 * facing when that step came after its report, as the target's position does.
 */
function latestPoseOf(state: AuthorityState, playerId: string, tick: number): VehiclePose | null {
  const target = vehicleTargetOf(state, playerId, tick)
  if (target === null) return null
  const cursor = vehicleOf(state, playerId).sweptCut
  const isStepLater =
    cursor !== undefined && cursor.tick > combatVehicleOf(state.combat, playerId).reportTick
  const facing = isStepLater ? cursor.facing : target.pose.facing
  return { ...target.pose, ...target.position, facing }
}

/** The drill's nose: a metre ahead of the body along its facing, as `noseTileOf` reads it. */
function nosePointOf(pose: VehiclePose): MillimetrePoint {
  const facing = facingVectorOf(pose.upx, pose.upy, pose.facing)
  return {
    x: pose.x + Math.trunc((facing.x * MM_PER_METRE) / UP_VECTOR_SCALE),
    y: pose.y + Math.trunc((facing.y * MM_PER_METRE) / UP_VECTOR_SCALE),
  }
}
