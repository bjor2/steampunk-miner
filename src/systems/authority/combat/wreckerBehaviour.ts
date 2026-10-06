/**
 * A tunnel wrecker's free phases (spec #111 Behaviour, Systems' numbers): it ignores the vehicle
 * and goes for the route home.
 *
 *   seek  -- a vehicle within fleeTiles -->                 flee
 *   seek  -- at its ring -->                                gnaw
 *   seek  -- its ring no longer gnawable -->                the nearest gnawable ring, or waits
 *   gnaw  -- a vehicle within fleeTiles -->                 flee
 *   gnaw  -- a vehicle within ignoreVehicleTiles of it,
 *            or its lining gone -->                         seek
 *   gnaw  -- gnawTicksPerRing later -->                     the ring breached, seek the next
 *   flee  -- no vehicle within ignoreVehicleTiles -->       gone into the rock (`wrecker_fled`)
 *
 * It swims through rock like a burrower, at its walking speed. Fleeing it steps straight away from
 * the nearest vehicle; where the planet's edge stops it, it is cornered and the drill can pin it,
 * which is the only time it strikes (`enemyBehaviour.ts`). The next wrecker may come
 * `respawnTicks` after one fled or died.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { ECONOMY } from '../../economy/economy'
import type { RingPoint } from '../../vehicle/casingTrail'
import { withCombat, type AuthorityState } from '../authorityState'
import { gnawCasingRing } from '../casingGnaw'
import { chainEffects, type RuleEffect } from '../commandRule'
import { distanceSq, isWithinMm, stepAwayFrom, type MillimetrePoint } from './combatGeometry'
import { inPhase, type Enemy } from './combatState'
import { stepAlong, walkStepMmOf, walkToward, type Terrain } from './enemyMovement'
import { despawnEnemies } from './enemyRoster'
import { ticksInPhase, updated, type EnemyTurn } from './enemyTurn'
import {
  isAnyVehicleWithin,
  isStillGnawable,
  millimetresOf,
  nearestGnawableRing,
  vehiclePositionsOf,
  withWreckerGone,
} from './wreckerRoute'

const { gnawTicksPerRing, fleeTiles, ignoreVehicleTiles } = ECONOMY.enemies.tunnelWrecker
const MM_PER_TILE = MM_PER_METRE

export function seekRing(turn: EnemyTurn): RuleEffect {
  if (isVehicleWithinFleeReach(turn)) return startFleeing(turn)
  const { state, enemy, terrain, tick } = turn
  const ring = ringToSeek(turn)
  const seeking = { ...stayingIn(enemy, 'seek', tick), ring }
  if (ring === null) return updated(state, seeking)
  if (isAtRing(enemy, ring)) return updated(state, { ...inPhase(enemy, 'gnaw', tick), ring })
  return updated(state, walkToward(terrain, seeking, millimetresOf(ring)))
}

export function gnawRing(turn: EnemyTurn): RuleEffect {
  if (isVehicleWithinFleeReach(turn)) return startFleeing(turn)
  const { state, enemy, terrain, tick } = turn
  if (!isStillGnawable(state, terrain.params, enemy, tick)) {
    return updated(state, { ...inPhase(enemy, 'seek', tick), ring: null })
  }
  if (ticksInPhase(enemy, tick) < gnawTicksPerRing) return updated(state, enemy)
  return breachTheRing(turn)
}

export function fleeIntoRock(turn: EnemyTurn): RuleEffect {
  const { state, enemy, terrain, tick } = turn
  const chaser = nearestVehicleInSight(state, enemy, tick)
  if (chaser === null) return fleeAway(state, enemy, tick)
  return updated(state, runningFrom(terrain, enemy, chaser))
}

function isVehicleWithinFleeReach({ state, enemy, tick }: EnemyTurn): boolean {
  return isAnyVehicleWithin(state, enemy, fleeTiles, tick)
}

function startFleeing({ state, enemy, tick }: EnemyTurn): RuleEffect {
  return updated(state, { ...inPhase(enemy, 'flee', tick), ring: null })
}

/** Its own ring while that is still gnawable, else the nearest gnawable one. */
function ringToSeek({ state, enemy, terrain, tick }: EnemyTurn): RingPoint | null {
  if (isStillGnawable(state, terrain.params, enemy, tick)) return enemy.ring
  return nearestGnawableRing(state, terrain.params, enemy, tick)?.point ?? null
}

function isAtRing(enemy: Enemy, ring: RingPoint): boolean {
  return isWithinMm(enemy, millimetresOf(ring), walkStepMmOf(enemy))
}

function breachTheRing({ state, enemy, terrain, tick }: EnemyTurn): RuleEffect {
  const ring = enemy.ring as RingPoint
  return chainEffects(state, [
    (current) => gnawCasingRing(current, terrain.params, ring, enemy.id),
    (current) => updated(current, { ...inPhase(enemy, 'seek', tick), ring: null }),
  ])
}

/** Out of every vehicle's sight it is gone into the rock; the next comes `respawnTicks` later. */
function fleeAway(state: AuthorityState, enemy: Enemy, tick: number): RuleEffect {
  const gone = despawnEnemies(state, [enemy])
  return {
    state: withCombat(gone.state, withWreckerGone(gone.state.combat, enemy.ownerId, tick)),
    events: [{ type: 'WreckerFled', enemyId: enemy.id }, ...gone.events],
  }
}

/** One walking step straight away from the chasing vehicle, or none where the edge stops it. */
function runningFrom(terrain: Terrain, enemy: Enemy, chaser: MillimetrePoint): Enemy {
  const running = { ...enemy, step: stepAwayFrom(enemy, chaser, walkStepMmOf(enemy)) }
  return stepAlong(terrain, running) ?? running
}

/** The nearest vehicle within `ignoreVehicleTiles`; vehicles at the same distance keep id order. */
function nearestVehicleInSight(
  state: AuthorityState,
  enemy: Enemy,
  tick: number,
): MillimetrePoint | null {
  const inSight = vehiclePositionsOf(state, tick).filter((vehicle) =>
    isWithinMm(vehicle, enemy, ignoreVehicleTiles * MM_PER_TILE),
  )
  return inSight.reduce<MillimetrePoint | null>(
    (nearest, vehicle) => nearerOf(enemy, nearest, vehicle),
    null,
  )
}

function nearerOf(
  enemy: Enemy,
  kept: MillimetrePoint | null,
  next: MillimetrePoint,
): MillimetrePoint {
  if (kept === null) return next
  return distanceSq(enemy, next) < distanceSq(enemy, kept) ? next : kept
}

/** The enemy in `phase`, keeping its phase start when it is already in it. */
function stayingIn(enemy: Enemy, phase: Enemy['phase'], tick: number): Enemy {
  return enemy.phase === phase ? enemy : inPhase(enemy, phase, tick)
}
