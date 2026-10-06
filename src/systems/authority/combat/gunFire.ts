/**
 * The `auto_guns` turret on the authority's clock (#107 design and numbers): on every combat tick,
 * after the enemies have acted, a vehicle whose guns are mounted, on Auto and due fires one shot at
 * its target (`gunTargets.ts`). A shot costs `energy.perShot` from the boiler, deals
 * `gunShotDamage` and makes the guns wait `gunFireIntervalTicks`. There is no ammunition, no miss
 * and no terrain damage: mining stays the drill's job.
 *
 * The guns stay quiet while a shot would take the tank under the rescue floor, so they never
 * strand the player, and they fire only from an active vehicle. The server owns targeting and
 * hits; each vehicle fires its own guns, and they hit enemies only, never another vehicle.
 */
import { gunFireIntervalTicks, gunShotDamage } from '../../economy/gunStats'
import { cmp, sub, ZERO_MONEY } from '../../money'
import { GUN_SHOT_QUANTA } from '../../vehicle/energyQuanta'
import { hasSteamForShot, isGunOnAuto } from '../../vehicle/vehicleGun'
import { isVehicleActive } from '../../vehicle/vehicleState'
import { vehicleOf, withCombat, withVehicle, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import { followEnergyChange } from '../vehicleTransitions'
import { combatVehicleOf, withCombatVehicle, withEnemy, type Enemy } from './combatState'
import { killEnemy } from './enemyDamage'
import type { Terrain } from './enemyMovement'
import { flushGunHitsOn, tallyGunHit } from './gunHits'
import { gunTargetOf } from './gunTargets'
import { vehicleTargetOf } from './vehicleTarget'

export function fireGun(
  state: AuthorityState,
  playerId: string,
  terrain: Terrain,
  tick: number,
): RuleEffect {
  const enemy = dueGunTargetOf(state, playerId, terrain, tick)
  if (enemy === null) return unchanged(state)
  return chainEffects(state, [
    (current) => spendShot(current, playerId, tick),
    (current) => shootEnemy(current, playerId, enemy, tick),
    (current) => followEnergyChange(current, playerId, tick),
  ])
}

/** The enemy this vehicle's guns fire at this tick, or null when they hold fire. */
function dueGunTargetOf(
  state: AuthorityState,
  playerId: string,
  terrain: Terrain,
  tick: number,
): Enemy | null {
  if (!isGunDue(state, playerId, tick)) return null
  const target = vehicleTargetOf(state, playerId, tick)
  return target === null ? null : gunTargetOf(terrain, target, state.combat.enemies)
}

function isGunDue(state: AuthorityState, playerId: string, tick: number): boolean {
  const vehicle = vehicleOf(state, playerId)
  return (
    isVehicleActive(vehicle) &&
    isGunOnAuto(vehicle.gun) &&
    hasSteamForShot(vehicle) &&
    tick >= combatVehicleOf(state.combat, playerId).gunReadyTick
  )
}

function spendShot(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const fired = withVehicle(state, playerId, {
    ...vehicle,
    energy: vehicle.energy - GUN_SHOT_QUANTA,
  })
  const gunReadyTick = tick + gunFireIntervalTicks(vehicle.gun.level)
  return unchanged(withCombat(fired, withCombatVehicle(fired.combat, playerId, { gunReadyTick })))
}

/** The shot lands; a kill logs the guns' hits on the enemy first, then `enemy_killed {by: gun}`. */
function shootEnemy(
  state: AuthorityState,
  playerId: string,
  enemy: Enemy,
  tick: number,
): RuleEffect {
  const damage = gunShotDamage(vehicleOf(state, playerId).levels.drill_power)
  const hit = { ...enemy, health: sub(enemy.health, damage) }
  const next = tallyGunHit(
    withCombat(state, withEnemy(state.combat, hit)),
    playerId,
    enemy.id,
    damage,
  )
  if (cmp(hit.health, ZERO_MONEY) > 0) return unchanged(next)
  return chainEffects(next, [
    (current) => flushGunHitsOn(current, playerId, enemy.id),
    // Drill damage only pends on a pinned enemy, and a pinned enemy sits in front.
    (current) => killEnemy(current, hit, 'front', tick, 'gun'),
  ])
}
