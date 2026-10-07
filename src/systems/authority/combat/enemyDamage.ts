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
 * - A charge's blast (#109) hits every enemy in its radius once, logged at once with no arc; drill
 *   damage still pending on a pinned one is logged first.
 */
import { ENEMY_DAMAGE_LOG_TICKS } from '../../../constants/balance'
import { pinnedDrillDamagePerTick } from '../../economy/enemyStats'
import { drillPowerAtStep } from '../../economy/vehicleStats'
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
import type { DomainEventBody, EnemyKiller } from '../domainEvent'
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

/** A blast's `amount` on one enemy at `tick`; at 0 health it dies, killed by the blast. */
export function blastEnemy(
  state: AuthorityState,
  enemy: Enemy,
  amount: BigStat,
  tick: number,
): RuleEffect {
  const flushed = flushDrillDamage(state, enemy.id, 'front')
  const current = enemyById(flushed.state.combat, enemy.id) ?? enemy
  const hit = { ...current, health: sub(current.health, amount) }
  const damaged: DomainEventBody = {
    type: 'EnemyDamaged',
    enemyId: enemy.id,
    amount: toCanonical(amount),
    source: 'blast',
    arc: null,
    ticks: 0,
  }
  const outcome =
    cmp(hit.health, ZERO_MONEY) <= 0
      ? removeKilled(flushed.state, hit, 'blast', tick)
      : unchanged(withCombat(flushed.state, withEnemy(flushed.state.combat, hit)))
  return { state: outcome.state, events: [...flushed.events, damaged, ...outcome.events] }
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
  if (cmp(damaged.health, ZERO_MONEY) <= 0)
    return killEnemy(next, damaged, cut.arc, cut.tick, 'drill')
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

/**
 * The enemy is gone for the trip; drill damage not yet logged is logged first, in `arc`, and
 * `by` says whether the drill or the guns dealt the killing damage (#107). A killed tunnel
 * wrecker starts its respawn wait at `tick` (#111).
 */
export function killEnemy(
  state: AuthorityState,
  enemy: Enemy,
  arc: HitArc,
  tick: number,
  by: EnemyKiller,
): RuleEffect {
  return chainEffects(state, [
    (current) => flushDrillDamage(current, enemy.id, arc),
    (current) => removeKilled(current, enemy, by, tick),
  ])
}

function removeKilled(
  state: AuthorityState,
  enemy: Enemy,
  by: EnemyKiller,
  tick: number,
): RuleEffect {
  return {
    state: withCombat(state, removedAndUsed(state, enemy, tick)),
    events: [{ type: 'EnemyKilled', enemyId: enemy.id, kind: enemy.kind, tier: enemy.tier, by }],
  }
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
  return pinnedDrillDamagePerTick(drillPowerAtStep(vehicleOf(state, playerId).levels.drill_power))
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
