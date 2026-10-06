/**
 * Drill damage on enemies (decision #9 "Front contact" and the burrower row):
 *
 * - A pinned enemy loses `drillPower * kDrillVsEnemy / 60` every tick with no input beyond facing
 *   it, while the vehicle pays the drill's energy (`cDrill`, 4 quanta a tick). With an empty tank
 *   the drill does not cut.
 * - Drilling the tile a burrower swims in damages it by the same amount per drilled tick.
 * - `enemy_damaged` sums continuous drill damage per 30 ticks and flushes before a kill.
 * - A killed enemy is gone for the trip: its spawn point stays used until the next dock. A killed
 *   tunnel wrecker came from no spawn point; the next may come `respawnTicks` later (#111).
 */
import { ENEMY_DAMAGE_LOG_TICKS } from '../../../constants/balance'
import { pinnedDrillDamagePerTick } from '../../economy/enemyStats'
import {
  add,
  cmp,
  fromSafeInteger,
  mul,
  sub,
  toCanonical,
  ZERO_MONEY,
  type BigStat,
} from '../../money'
import { ENERGY_QUANTA_PER_TICK } from '../../vehicle/energyQuanta'
import { tileOfMillimetres, type VehiclePose } from '../../vehicle/vehiclePose'
import type { TilePoint } from '../../world/tileGrid'
import { vehicleOf, withCombat, withVehicle, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import { followEnergyChange } from '../vehicleTransitions'
import {
  DEBUG_SPAWN_POINT_ID,
  enemyById,
  NO_PENDING_DRILL,
  withEnemy,
  withoutEnemy,
  type CombatState,
  type Enemy,
  type HitArc,
} from './combatState'
import { hitArcOf } from './hitArc'
import { withWreckerGone } from './wreckerRoute'

export function drillPinnedEnemy(state: AuthorityState, enemy: Enemy, tick: number): RuleEffect {
  const vehicle = vehicleOf(state, enemy.ownerId)
  if (vehicle.energy < ENERGY_QUANTA_PER_TICK.drill) return unchanged(state)
  return chainEffects(state, [
    (current) => chargeOneDrillTick(current, enemy.ownerId),
    (current) =>
      damageEnemy(current, enemy, drillDamagePerTickOf(current, enemy.ownerId), {
        ticks: 1,
        arc: 'front',
        tick,
      }),
    (current) => followEnergyChange(current, enemy.ownerId, tick),
  ])
}

/** `ticks` of drilling on one tile, up to `tick`, also cut the burrowers swimming in it (not pinned ones). */
export function drillBurrowersOnTile(
  state: AuthorityState,
  playerId: string,
  tile: TilePoint,
  ticks: number,
  tick: number,
): RuleEffect {
  const burrowers = state.combat.enemies.filter((enemy) => isSwimmingIn(enemy, tile))
  if (ticks === 0 || burrowers.length === 0) return unchanged(state)
  const amount = mul(drillDamagePerTickOf(state, playerId), fromSafeInteger(ticks))
  const arcOf = (burrower: Enemy) => arcFromDriller(vehicleOf(state, playerId).pose, burrower)
  return chainEffects(
    state,
    burrowers.map(
      (burrower) => (current: AuthorityState) =>
        drillOneBurrower(current, burrower, amount, { ticks, arc: arcOf(burrower), tick }),
    ),
  )
}

/** Logs a pinned enemy's drill damage not yet logged; for a released pin or a kill. */
export function flushDrillDamage(state: AuthorityState, enemyId: string, arc: HitArc): RuleEffect {
  const enemy = enemyById(state.combat, enemyId)
  if (enemy === undefined || enemy.pendingDrill.ticks === 0) return unchanged(state)
  const { amount, ticks } = enemy.pendingDrill
  return {
    state: withCombat(state, withEnemy(state.combat, { ...enemy, pendingDrill: NO_PENDING_DRILL })),
    events: [
      { type: 'EnemyDamaged', enemyId, amount: toCanonical(amount), source: 'drill', arc, ticks },
    ],
  }
}

/** One drilling: `ticks` of drill, from the `arc` it came from, ending at `tick`. */
interface DrillCut {
  ticks: number
  arc: HitArc
  tick: number
}

function damageEnemy(
  state: AuthorityState,
  enemy: Enemy,
  amount: BigStat,
  cut: DrillCut,
): RuleEffect {
  const damaged = withDrillDamage(enemyById(state.combat, enemy.id) ?? enemy, amount, cut.ticks)
  const next = withCombat(state, withEnemy(state.combat, damaged))
  if (cmp(damaged.health, ZERO_MONEY) <= 0) return killEnemy(next, damaged, cut)
  const isLogDue = damaged.pendingDrill.ticks >= ENEMY_DAMAGE_LOG_TICKS
  return isLogDue ? flushDrillDamage(next, enemy.id, cut.arc) : unchanged(next)
}

function withDrillDamage(enemy: Enemy, amount: BigStat, ticks: number): Enemy {
  return {
    ...enemy,
    health: sub(enemy.health, amount),
    pendingDrill: {
      amount: add(enemy.pendingDrill.amount, amount),
      ticks: enemy.pendingDrill.ticks + ticks,
    },
  }
}

function killEnemy(state: AuthorityState, enemy: Enemy, cut: DrillCut): RuleEffect {
  return chainEffects(state, [
    (current) => flushDrillDamage(current, enemy.id, cut.arc),
    (current) => ({
      state: withCombat(current, removedAndUsed(current, enemy, cut.tick)),
      events: [
        { type: 'EnemyKilled', enemyId: enemy.id, kind: enemy.kind, tier: enemy.tier, by: 'drill' },
      ],
    }),
  ])
}

function removedAndUsed(state: AuthorityState, enemy: Enemy, tick: number): CombatState {
  const combat = withoutEnemy(state.combat, enemy.id)
  if (enemy.kind === 'tunnel_wrecker') return withWreckerGone(combat, enemy.ownerId, tick)
  if (enemy.spawnPointId === DEBUG_SPAWN_POINT_ID) return combat
  return { ...combat, usedSpawnPointIds: [...combat.usedSpawnPointIds, enemy.spawnPointId] }
}

/** A drilled burrower's damage is logged at once, with the zone it was in. */
function drillOneBurrower(
  state: AuthorityState,
  burrower: Enemy,
  amount: BigStat,
  cut: DrillCut,
): RuleEffect {
  return chainEffects(state, [
    (current) => damageEnemy(current, burrower, amount, cut),
    (current) => flushDrillDamage(current, burrower.id, cut.arc),
  ])
}

function chargeOneDrillTick(state: AuthorityState, playerId: string): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const energy = vehicle.energy - ENERGY_QUANTA_PER_TICK.drill
  return unchanged(withVehicle(state, playerId, { ...vehicle, energy }))
}

function drillDamagePerTickOf(state: AuthorityState, playerId: string): BigStat {
  return pinnedDrillDamagePerTick(vehicleOf(state, playerId).levels.drill_power)
}

function isSwimmingIn(enemy: Enemy, tile: TilePoint): boolean {
  const at = tileOfMillimetres(enemy.x, enemy.y)
  return (
    enemy.kind === 'burrower' && enemy.phase !== 'pinned' && at.tx === tile.tx && at.ty === tile.ty
  )
}

/** Drilling needs a pose, so the driller always has one; front is only a fallback. */
function arcFromDriller(pose: VehiclePose | null, enemy: Enemy): HitArc {
  return pose === null ? 'front' : hitArcOf(pose, enemy.x - pose.x, enemy.y - pose.y)
}
