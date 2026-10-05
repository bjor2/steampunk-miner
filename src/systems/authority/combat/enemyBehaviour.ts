/**
 * One enemy's tick (decision #9 roster and "Telegraph"): hunt, wind up, lunge, then pin or recoil.
 *
 *   idle      -- vehicle within detection -->           approach
 *   approach  -- within lunge reach, cooldown over -->  windup (the telegraph, at least 24 ticks)
 *   windup    -- windupTicks later -->                  lunge (straight, at most 30 ticks)
 *   lunge     -- touches the vehicle, front -->         pinned, front hit
 *   lunge     -- touches the vehicle, side or rear -->  recoil, 1x or 2x hit
 *   lunge     -- blocked or over -->                    approach, cooldown starts
 *   recoil    -- recoilTicks later -->                  approach
 *   any       -- touches the drill's nose -->           pinned (no hit: nothing was telegraphed)
 *   pinned    -- leaves the front zone or reach -->     recoil
 *
 * A pinned enemy is drilled every tick and strikes the front once per attack cooldown, which is
 * never shorter than the wind-up. Frozen enemies (`freezeEnemies`) neither move nor strike, but
 * the drill still pins and cuts them. An enemy whose vehicle cannot be hit waits, idle.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { enemyBoundedStats } from '../../economy/enemyStats'
import { withCombat, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import { isOnTheNose, isTouching, isWithinMm, stepAwayFrom, stepToward } from './combatGeometry'
import { enemyById, inPhase, withEnemy, type Enemy, type EnemyPhase } from './combatState'
import { drillPinnedEnemy, flushDrillDamage } from './enemyDamage'
import { contactArcOf, strikeVehicle } from './enemyHits'
import { lungeStepMmOf, stepAlong, walkStepMmOf, walkToward, type Terrain } from './enemyMovement'
import { vehicleTargetOf, type VehicleTarget } from './vehicleTarget'

interface EnemyTurn {
  state: AuthorityState
  enemy: Enemy
  target: VehicleTarget
  terrain: Terrain
  tick: number
}

type PhaseStep = (turn: EnemyTurn) => RuleEffect

const FREE_PHASE_STEPS: Readonly<Record<Exclude<EnemyPhase, 'pinned'>, PhaseStep>> = {
  idle: hunt,
  approach: hunt,
  windup: windUp,
  lunge: lunge,
  recoil: recoil,
}

export function stepEnemy(
  state: AuthorityState,
  enemyId: string,
  terrain: Terrain,
  tick: number,
): RuleEffect {
  const enemy = enemyById(state.combat, enemyId)
  if (enemy === undefined) return unchanged(state)
  const target = vehicleTargetOf(state, enemy.ownerId, tick)
  if (target === null) return waitIdle(state, enemy, tick)
  const turn: EnemyTurn = { state, enemy, target, terrain, tick }
  if (enemy.phase === 'pinned') return holdOnTheDrill(turn)
  if (enemy.phase !== 'lunge' && isOnTheNose(target.pose, target.position, enemy)) {
    return updated(state, inPhase(enemy, 'pinned', tick))
  }
  if (state.combat.isFrozen) return unchanged(state)
  return FREE_PHASE_STEPS[enemy.phase](turn)
}

function hunt({ state, enemy, target, terrain, tick }: EnemyTurn): RuleEffect {
  const stats = enemyBoundedStats(enemy.kind, enemy.tier)
  if (!isWithinMm(target.position, enemy, stats.detectionTiles * MM_PER_METRE)) {
    return updated(state, enemy.phase === 'idle' ? enemy : inPhase(enemy, 'idle', tick))
  }
  if (!isWithinMm(target.position, enemy, lungeReachMm(enemy))) {
    return updated(state, { ...walkToward(terrain, enemy, target.position), phase: 'approach' })
  }
  if (tick < enemy.readyTick) return updated(state, { ...enemy, phase: 'approach' })
  return updated(state, inPhase(enemy, 'windup', tick))
}

function windUp({ state, enemy, target, tick }: EnemyTurn): RuleEffect {
  if (tick - enemy.phaseSinceTick < enemyBoundedStats(enemy.kind, enemy.tier).windupTicks) {
    return unchanged(state)
  }
  const step = stepToward(enemy, target.position, lungeStepMmOf(enemy))
  return updated(state, { ...inPhase(enemy, 'lunge', tick), step })
}

function lunge(turn: EnemyTurn): RuleEffect {
  const { state, enemy, target, terrain, tick } = turn
  const moved = stepAlong(terrain, enemy)
  if (moved !== null && isTouching(target.position, moved))
    return hitOnContact({ ...turn, enemy: moved })
  if (
    moved === null ||
    tick - enemy.phaseSinceTick >= enemyBoundedStats(enemy.kind, enemy.tier).lungeTicks
  ) {
    return updated(state, afterAttack(moved ?? enemy, tick))
  }
  return updated(state, moved)
}

function recoil({ state, enemy, terrain, tick }: EnemyTurn): RuleEffect {
  if (tick - enemy.phaseSinceTick >= enemyBoundedStats(enemy.kind, enemy.tier).recoilTicks) {
    return updated(state, inPhase(enemy, 'approach', tick))
  }
  return updated(state, stepAlong(terrain, enemy) ?? enemy)
}

/** The lunge lands: front pins it on the head, side or rear sends it back (#9). */
function hitOnContact({ state, enemy, target, tick }: EnemyTurn): RuleEffect {
  const arc = contactArcOf(state, target, enemy, tick)
  const after =
    arc === 'front' ? inPhase(enemy, 'pinned', tick) : recoilingFrom(enemy, target, tick)
  return chainEffects(updated(state, after).state, [
    (current) => strikeVehicle(current, after, arc, tick),
  ])
}

function holdOnTheDrill(turn: EnemyTurn): RuleEffect {
  const { state, enemy, target, tick } = turn
  if (!isOnTheNose(target.pose, target.position, enemy)) {
    return chainEffects(state, [
      (current) => flushDrillDamage(current, enemy.id, 'front'),
      (current) => updated(current, { ...recoilingFrom(latest(current, enemy), target, tick) }),
    ])
  }
  return chainEffects(state, [
    (current) => drillPinnedEnemy(current, enemy, tick),
    (current) => strikeWhilePinned(current, enemy.id, tick),
  ])
}

/** Once per attack cooldown after the pin, a pinned enemy still alive strikes the front (#9). */
function strikeWhilePinned(state: AuthorityState, enemyId: string, tick: number): RuleEffect {
  const enemy = enemyById(state.combat, enemyId)
  if (enemy === undefined) return unchanged(state)
  const pinnedFor = tick - enemy.phaseSinceTick
  const cooldown = enemyBoundedStats(enemy.kind, enemy.tier).attackCooldownTicks
  if (state.combat.isFrozen || pinnedFor === 0 || pinnedFor % cooldown !== 0)
    return unchanged(state)
  return strikeVehicle(state, enemy, 'front', tick)
}

function waitIdle(state: AuthorityState, enemy: Enemy, tick: number): RuleEffect {
  if (enemy.phase === 'idle') return unchanged(state)
  return chainEffects(state, [
    (current) => flushDrillDamage(current, enemy.id, 'front'),
    (current) => updated(current, inPhase(latest(current, enemy), 'idle', tick)),
  ])
}

function recoilingFrom(enemy: Enemy, target: VehicleTarget, tick: number): Enemy {
  const { recoilTicks, attackCooldownTicks } = enemyBoundedStats(enemy.kind, enemy.tier)
  return {
    ...inPhase(enemy, 'recoil', tick),
    step: stepAwayFrom(enemy, target.position, walkStepMmOf(enemy)),
    readyTick: tick + recoilTicks + attackCooldownTicks,
  }
}

function afterAttack(enemy: Enemy, tick: number): Enemy {
  const { attackCooldownTicks } = enemyBoundedStats(enemy.kind, enemy.tier)
  return { ...inPhase(enemy, 'approach', tick), readyTick: tick + attackCooldownTicks }
}

/** How close an enemy comes before it winds up: as far as its lunge reaches. */
function lungeReachMm(enemy: Enemy): number {
  return lungeStepMmOf(enemy) * enemyBoundedStats(enemy.kind, enemy.tier).lungeTicks
}

function latest(state: AuthorityState, enemy: Enemy): Enemy {
  return enemyById(state.combat, enemy.id) ?? enemy
}

function updated(state: AuthorityState, enemy: Enemy): RuleEffect {
  return unchanged(withCombat(state, withEnemy(state.combat, enemy)))
}
