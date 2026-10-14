/**
 * The galvanic arc coil (#261, the GD locks on #245 and #255: galvanism, the arc verb): one bolt
 * per slot tap. When the wind-up ends a bolt jumps from the vehicle to the nearest enemy within
 * its reach (the use's Mark magnitude, in tiles) and chains from each enemy hit to the nearest
 * one not yet hit within `chainTiles`, at most `chainCount` more. Every hit takes one auto-gun
 * shot at the current drill power (`gunShotDamage`, #107: the guns' damage follows the drill, the
 * gun level buys rate only), so there is no new damage curve, through the kernel's one-off hit
 * (`blastEnemy`: logged at once, from no arc, a kill removing the enemy as any kill does). It adds
 * a verb, never yield: no cell changes and no ore moves.
 *
 * A bolt costs its energy from the tank and heat onto the item gauge (the lock: energy and heat,
 * no new resource). With no enemy in reach, or a tank that cannot pay, the press is refused and
 * costs nothing. Equal distances go to the enemy spawned first, as the guns pick, so a replay
 * always hits the same ones.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import {
  vehicleOf,
  withVehicle,
  type AuthorityState,
} from '../../../systems/authority/authorityState'
import { distanceSq, type MillimetrePoint } from '../../../systems/authority/combat/combatGeometry'
import type { Enemy } from '../../../systems/authority/combat/combatState'
import { blastEnemy } from '../../../systems/authority/combat/enemyDamage'
import { vehicleTargetOf } from '../../../systems/authority/combat/vehicleTarget'
import { chainEffects, type RuleEffect } from '../../../systems/authority/commandRule'
import { gunShotDamage } from '../../../systems/economy/gunStats'
import { toCanonical, type BigStat } from '../../../systems/money'
import type { PowerUp, PowerUpOutcome, PowerUpUse } from '../../power-up-core'
import type { ArcCoilBalance } from './aethericEconomy'
import { arcFiredOf, ENERGY_SHORT, NO_TARGET } from './aethericEvents'
import { ARC_COIL_ICON_ID, ARC_COIL_ID, ARC_COIL_NAME, arcCoilBalance } from './arcCoilItem'
import { withItemHeatAdded } from './itemHeat'

/**
 * The coil as `power-up-core` runs it (#162 2.1, 4.2): a charged item whose charges refill at
 * the dock, with the Mark 1 numbers that power-up-core steps with the ladder, handing the use the
 * bolt's reach as its magnitude.
 */
export function arcCoilPowerUp(): PowerUp {
  const balance = arcCoilBalance()
  return {
    id: 'aetheric.arc_coil',
    itemId: ARC_COIL_ID,
    iconId: ARC_COIL_ICON_ID,
    name: ARC_COIL_NAME,
    powerUpClass: 'charged',
    charges: balance.charges,
    cooldownTicks: balance.cooldownTicks,
    windupTicks: balance.windupTicks,
    channelTicks: 0,
    isToggle: false,
    energyDrawBpPerSecond: 0,
    activate: fireArc,
  }
}

/** The bolt: pay, heat the gauge, hit the chain; refused with no target or a short tank. */
export function fireArc(state: AuthorityState, use: PowerUpUse): PowerUpOutcome {
  const balance = arcCoilBalance()
  const targets = arcTargetsOf(state, use, balance)
  if (targets.length === 0) return { kind: 'refused', reason: NO_TARGET }
  if (!canPayBolt(state, use.playerId, balance)) return { kind: 'refused', reason: ENERGY_SHORT }
  const damage = gunShotDamage(vehicleOf(state, use.playerId).levels.drill_power)
  const paid = withBoltPaid(state, use, balance)
  const struck = strikeTargets(paid, targets, damage, use.tick)
  return {
    kind: 'acted',
    effect: {
      state: struck.state,
      events: [...struck.events, arcFiredOfUse(use, targets.length, damage, balance)],
    },
  }
}

/** The enemies the bolt hits, in order: the nearest in reach, then the chain. */
export function arcTargetsOf(
  state: AuthorityState,
  use: PowerUpUse,
  balance: ArcCoilBalance,
): Enemy[] {
  const target = vehicleTargetOf(state, use.playerId, use.tick)
  if (target === null) return []
  const reachMm = (use.magnitude ?? balance.rangeTiles) * MM_PER_METRE
  const first = nearestWithin(target.position, state.combat.enemies, reachMm)
  if (first === null) return []
  return chainFrom([first], state.combat.enemies, balance)
}

/** Each hop: the nearest enemy not yet hit within `chainTiles` of the last one hit. */
function chainFrom(hit: Enemy[], enemies: readonly Enemy[], balance: ArcCoilBalance): Enemy[] {
  if (hit.length > balance.chainCount) return hit
  const last = hit[hit.length - 1]
  const left = enemies.filter((enemy) => !hit.includes(enemy))
  const next = nearestWithin(last, left, balance.chainTiles * MM_PER_METRE)
  return next === null ? hit : chainFrom([...hit, next], enemies, balance)
}

/** The nearest enemy within `reachMm` of `from`; equal distances go to the one spawned first. */
function nearestWithin(
  from: MillimetrePoint,
  enemies: readonly Enemy[],
  reachMm: number,
): Enemy | null {
  const inReach = enemies.filter((enemy) => distanceSq(from, enemy) <= reachMm * reachMm)
  return inReach.reduce<Enemy | null>(
    (nearest, enemy) => (nearest === null || isNearer(from, enemy, nearest) ? enemy : nearest),
    null,
  )
}

function isNearer(from: MillimetrePoint, enemy: Enemy, nearest: Enemy): boolean {
  const order = distanceSq(from, enemy) - distanceSq(from, nearest)
  return order < 0 || (order === 0 && isSpawnedBefore(enemy, nearest))
}

/** Ids are `e1`, `e2`, ... in spawn order: a shorter id is an earlier one (as `gunTargets.ts`). */
function isSpawnedBefore(enemy: Enemy, other: Enemy): boolean {
  if (enemy.id.length !== other.id.length) return enemy.id.length < other.id.length
  return enemy.id < other.id
}

function canPayBolt(state: AuthorityState, playerId: string, balance: ArcCoilBalance): boolean {
  return vehicleOf(state, playerId).energy >= balance.energyQuanta
}

function withBoltPaid(state: AuthorityState, use: PowerUpUse, balance: ArcCoilBalance) {
  const vehicle = vehicleOf(state, use.playerId)
  const paid = withVehicle(state, use.playerId, {
    ...vehicle,
    energy: vehicle.energy - balance.energyQuanta,
  })
  return withItemHeatAdded(paid, use.playerId, use.tick, balance.heatUnits)
}

function strikeTargets(
  state: AuthorityState,
  targets: readonly Enemy[],
  damage: BigStat,
  tick: number,
): RuleEffect {
  return chainEffects(
    state,
    targets.map((enemy) => (current: AuthorityState) => blastEnemy(current, enemy, damage, tick)),
  )
}

function arcFiredOfUse(use: PowerUpUse, targets: number, damage: BigStat, balance: ArcCoilBalance) {
  return arcFiredOf({
    playerId: use.playerId,
    itemId: use.itemId,
    targets,
    damage: toCanonical(damage),
    energy: balance.energyQuanta,
    heat: balance.heatUnits,
  })
}
