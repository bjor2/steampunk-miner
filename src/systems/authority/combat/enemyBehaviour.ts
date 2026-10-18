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
 *
 * A tunnel wrecker (#111) never hunts: its free phases seek, gnaw and flee (`wreckerBehaviour.ts`),
 * and only a wrecker cornered on the drill strikes, through the same pin.
 *
 * With the dev flag `enemy.lureRetarget` on (ticket 361), a hunter that would hunt walks to a live
 * lure in reach instead (`enemyLures`), and hunts the vehicle again once it ends. A wind-up, lunge
 * or recoil under way goes on, and a wrecker never hears a lure.
 *
 * A burrower a slice flushes (`enemyFlushes`, ticket 386) leaves the hunt for the nearest exposed
 * face instead, and once out hunts through open cells only while the flush lasts
 * (`burrowerFlush.ts`); a wind-up, lunge or recoil under way goes on.
 */
import type { AuthorityDevFlags } from '../../../constants/devFlags'
import { flagsOf } from '../devFlagState'
import { MM_PER_METRE } from '../../../constants/physics'
import type { EnemyKind } from '../../economy/economyDefinition'
import { enemyBoundedStats, type EnemyBoundedStats } from '../../economy/enemyStats'
import { detectionReachMm } from '../../registries/enemyDetectionModifiers'
import { lureGoalOf } from '../../registries/enemyLures'
import type { AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import {
  isOnTheNose,
  isTouching,
  isWithinMm,
  stepAwayFrom,
  stepToward,
  type MillimetrePoint,
} from './combatGeometry'
import { enemyById, inPhase, type Enemy, type EnemyPhase } from './combatState'
import { drillPinnedEnemy, flushDrillDamage } from './enemyDamage'
import { contactArcOf, strikeVehicle } from './enemyHits'
import {
  lungeStepMmOf,
  slowedLungeStepMmOf,
  slowedWalkStepMmOf,
  stepAlong,
  walkOpenToward,
  walkToward,
  type StepGround,
  type Terrain,
} from './enemyMovement'
import { flushMoveOf } from './burrowerFlush'
import { ticksInPhase, updated, type EnemyTurn, type PhaseStep } from './enemyTurn'
import { vehicleTargetOf, type VehicleTarget } from './vehicleTarget'
import { fleeIntoRock, gnawRing, seekRing } from './wreckerBehaviour'

type FreePhaseSteps = Readonly<Record<Exclude<EnemyPhase, 'pinned'>, PhaseStep>>

/** How a hunter takes one walking step toward its goal. */
type Walk = (ground: StepGround, enemy: Enemy, target: MillimetrePoint) => Enemy

/**
 * Crawlers and burrowers hunt the vehicle, unless a slice flushes the burrower out (ticket 386);
 * they never take a wrecker's phases.
 */
const HUNTER_PHASE_STEPS: FreePhaseSteps = {
  idle: flushOrHunt,
  approach: flushOrHunt,
  windup: windUp,
  lunge: lunge,
  recoil: recoil,
  seek: flushOrHunt,
  gnaw: flushOrHunt,
  flee: flushOrHunt,
}

/** A wrecker goes for the route, never the vehicle; after a released pin it backs off, then seeks. */
const WRECKER_PHASE_STEPS: FreePhaseSteps = {
  idle: seekRing,
  approach: seekRing,
  windup: seekRing,
  lunge: seekRing,
  recoil: recoil,
  seek: seekRing,
  gnaw: gnawRing,
  flee: fleeIntoRock,
}

/** With `enemy.lureRetarget` on, a hunter on the hunt follows a live lure first (ticket 361). */
const LURED_HUNTER_PHASE_STEPS: FreePhaseSteps = {
  ...HUNTER_PHASE_STEPS,
  idle: flushOrFollowLure,
  approach: flushOrFollowLure,
  seek: flushOrFollowLure,
  gnaw: flushOrFollowLure,
  flee: flushOrFollowLure,
}

type FreePhaseStepsOfKind = Readonly<Record<EnemyKind, FreePhaseSteps>>

const FREE_PHASE_STEPS_OF_KIND: FreePhaseStepsOfKind = {
  crawler: HUNTER_PHASE_STEPS,
  burrower: HUNTER_PHASE_STEPS,
  tunnel_wrecker: WRECKER_PHASE_STEPS,
}

const LURED_FREE_PHASE_STEPS_OF_KIND: FreePhaseStepsOfKind = {
  crawler: LURED_HUNTER_PHASE_STEPS,
  burrower: LURED_HUNTER_PHASE_STEPS,
  tunnel_wrecker: WRECKER_PHASE_STEPS,
}

export function stepEnemy(
  state: AuthorityState,
  enemyId: string,
  terrain: Terrain,
  tick: number,
  flags: AuthorityDevFlags = flagsOf(state),
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
  return freePhaseStepsOf(enemy.kind, flags)[enemy.phase](turn)
}

function freePhaseStepsOf(kind: EnemyKind, flags: AuthorityDevFlags): FreePhaseSteps {
  const stepsOfKind = flags['enemy.lureRetarget']
    ? LURED_FREE_PHASE_STEPS_OF_KIND
    : FREE_PHASE_STEPS_OF_KIND
  return stepsOfKind[kind]
}

function flushOrHunt(turn: EnemyTurn): RuleEffect {
  return flushOr(turn, hunt)
}

function flushOrFollowLure(turn: EnemyTurn): RuleEffect {
  return flushOr(turn, followLureOrHunt)
}

/** A flushed burrower heads out to its face or hunts in the open; anything else steps as it would. */
function flushOr(turn: EnemyTurn, otherwise: PhaseStep): RuleEffect {
  const move = flushMoveOf(turn)
  if (move === null) return otherwise(turn)
  return move.kind === 'surface' ? walkToGoal(turn, move.face) : huntInTheOpen(turn)
}

/** A live lure in reach is the path goal; with none the hunter hunts the vehicle (ticket 361). */
function followLureOrHunt(turn: EnemyTurn): RuleEffect {
  const lure = lureGoalOf(turn.state, turn.enemy, turn.tick)
  return lure === null ? hunt(turn) : walkToGoal(turn, lure)
}

/** One walking step toward a goal other than the vehicle: a lure or a flushed burrower's face. */
function walkToGoal(turn: EnemyTurn, goal: MillimetrePoint): RuleEffect {
  return updated(turn.state, { ...walkToward(turn, turn.enemy, goal), phase: 'approach' })
}

function hunt(turn: EnemyTurn): RuleEffect {
  return huntWalking(turn, walkToward)
}

/** A flushed burrower's hunt: it keeps to open cells, so it does not dive back in (ticket 386). */
function huntInTheOpen(turn: EnemyTurn): RuleEffect {
  return huntWalking(turn, walkOpenToward)
}

function huntWalking(turn: EnemyTurn, walk: Walk): RuleEffect {
  const { state, enemy, target, tick } = turn
  if (!isWithinMm(target.position, enemy, detectionReachOf(state, enemy, tick))) {
    return updated(state, enemy.phase === 'idle' ? enemy : inPhase(enemy, 'idle', tick))
  }
  if (!isWithinMm(target.position, enemy, lungeReachMm(enemy))) {
    return updated(state, { ...walk(turn, enemy, target.position), phase: 'approach' })
  }
  if (tick < enemy.readyTick) return updated(state, { ...enemy, phase: 'approach' })
  return updated(state, inPhase(enemy, 'windup', tick))
}

/** The enemy's detection reach, after any smoke a slice laid (ticket 233). */
function detectionReachOf(state: AuthorityState, enemy: Enemy, tick: number): number {
  return detectionReachMm(state, enemy, tick, statsOf(enemy).detectionTiles * MM_PER_METRE)
}

function windUp(turn: EnemyTurn): RuleEffect {
  const { state, enemy, target, tick } = turn
  if (ticksInPhase(enemy, tick) < statsOf(enemy).windupTicks) return unchanged(state)
  const step = stepToward(enemy, target.position, slowedLungeStepMmOf(turn, enemy))
  return updated(state, { ...inPhase(enemy, 'lunge', tick), step })
}

function lunge(turn: EnemyTurn): RuleEffect {
  const { state, enemy, target, terrain, tick } = turn
  const moved = stepAlong(terrain, enemy)
  if (moved === null) return updated(state, afterAttack(enemy, tick))
  if (isTouching(target.position, moved)) return hitOnContact({ ...turn, enemy: moved })
  const isLungeOver = ticksInPhase(enemy, tick) >= statsOf(enemy).lungeTicks
  return updated(state, isLungeOver ? afterAttack(moved, tick) : moved)
}

function recoil({ state, enemy, terrain, tick }: EnemyTurn): RuleEffect {
  if (ticksInPhase(enemy, tick) >= statsOf(enemy).recoilTicks) {
    return updated(state, inPhase(enemy, 'approach', tick))
  }
  return updated(state, stepAlong(terrain, enemy) ?? enemy)
}

/** The lunge lands: front pins it on the head, side or rear sends it back (#9). */
function hitOnContact(turn: EnemyTurn): RuleEffect {
  const { state, enemy, target, tick } = turn
  const arc = contactArcOf(state, target, enemy, tick)
  const after =
    arc === 'front' ? inPhase(enemy, 'pinned', tick) : recoilingFrom(turn, enemy, target)
  return chainEffects(updated(state, after).state, [
    (current) => strikeVehicle(current, after, arc, tick),
  ])
}

function holdOnTheDrill(turn: EnemyTurn): RuleEffect {
  const { state, enemy, target, tick } = turn
  if (!isOnTheNose(target.pose, target.position, enemy)) {
    return chainEffects(state, [
      (current) => flushDrillDamage(current, enemy.id, 'front'),
      (current) => updated(current, recoilingIn(current, turn)),
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
  if (enemy === undefined || state.combat.isFrozen || !isPinnedStrikeDue(enemy, tick)) {
    return unchanged(state)
  }
  return strikeVehicle(state, enemy, 'front', tick)
}

function isPinnedStrikeDue(enemy: Enemy, tick: number): boolean {
  const pinnedFor = ticksInPhase(enemy, tick)
  return pinnedFor > 0 && pinnedFor % statsOf(enemy).attackCooldownTicks === 0
}

function waitIdle(state: AuthorityState, enemy: Enemy, tick: number): RuleEffect {
  if (enemy.phase === 'idle') return unchanged(state)
  return chainEffects(state, [
    (current) => flushDrillDamage(current, enemy.id, 'front'),
    (current) => updated(current, inPhase(latest(current, enemy), 'idle', tick)),
  ])
}

/** The enemy as it stands in `current`, recoiling off the drill it slipped from. */
function recoilingIn(current: AuthorityState, turn: EnemyTurn): Enemy {
  const ground = { ...turn, state: current }
  return recoilingFrom(ground, latest(current, turn.enemy), turn.target)
}

/** The recoil's step is fixed here, after the strongest slice slow at its start (ticket 375). */
function recoilingFrom(ground: StepGround, enemy: Enemy, target: VehicleTarget): Enemy {
  const { tick } = ground
  const { recoilTicks, attackCooldownTicks } = statsOf(enemy)
  return {
    ...inPhase(enemy, 'recoil', tick),
    step: stepAwayFrom(enemy, target.position, slowedWalkStepMmOf(ground, enemy)),
    readyTick: tick + recoilTicks + attackCooldownTicks,
  }
}

function afterAttack(enemy: Enemy, tick: number): Enemy {
  const { attackCooldownTicks } = statsOf(enemy)
  return { ...inPhase(enemy, 'approach', tick), readyTick: tick + attackCooldownTicks }
}

/** How close an enemy comes before it winds up: as far as its lunge reaches. */
function lungeReachMm(enemy: Enemy): number {
  return lungeStepMmOf(enemy) * statsOf(enemy).lungeTicks
}

function statsOf(enemy: Enemy): EnemyBoundedStats {
  return enemyBoundedStats(enemy.kind, enemy.tier)
}

function latest(state: AuthorityState, enemy: Enemy): Enemy {
  return enemyById(state.combat, enemy.id) ?? enemy
}
