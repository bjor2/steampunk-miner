/**
 * The `auto_guns` turret on the authority's clock (#107 design and numbers): on every combat tick,
 * after the enemies have acted, a vehicle whose guns are mounted, on Auto and due fires one shot at
 * its target (`turretAim.ts`). A shot costs `energy.perShot` from the boiler, deals
 * `gunShotDamage` and makes the guns wait `gunFireIntervalTicks`. There is no ammunition, no miss
 * and no terrain damage: mining stays the drill's job.
 *
 * The guns stay quiet while a full shot would take the tank under the rescue floor, so they never
 * strand the player, and they fire only from an active vehicle. The server owns targeting and
 * hits; each vehicle fires its own guns, and they hit enemies only, never another vehicle.
 *
 * The turret's modules (ticket 382, the TD lock on #319) shape a shot through the `autoGuns`
 * provider, read once per due shot (`turretShape.ts`): its range, its energy, the fire director's
 * order, the sentry cam's open cone (`rigStillness.ts`), grapeshot's split (`grapeShot.ts`),
 * concussion's knock (`turretKnock.ts`) and the ricochet (`ricochet.ts`). Overpressure's toggle
 * (K-burst, ticket 383, `turretBurst.ts`) keeps the shape's `burst` cycle on the vehicle: a shot
 * in a burst waits the faster interval, and the guns hold fire through a vent without reading the
 * shape. With no provider the shape is #107's guns and every shot is as before.
 */
import { gunFireIntervalTicks, gunShotDamage } from '../../economy/gunStats'
import { cmp, sub, ZERO_MONEY, type BigStat } from '../../money'
import type { TurretShape } from '../../registries/autoGuns'
import { burstPhaseOf, gunIntervalAt } from '../../vehicle/gunBurst'
import { hasSteamForShot, isGunOnAuto } from '../../vehicle/vehicleGun'
import { isVehicleActive } from '../../vehicle/vehicleState'
import { vehicleOf, withCombat, withVehicle, type AuthorityState } from '../authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import { isForwardConeOpen } from '../rigStillness'
import { followEnergyChange } from '../vehicleTransitions'
import type { MillimetrePoint } from './combatGeometry'
import { combatVehicleOf, withCombatVehicle, withEnemy, type Enemy } from './combatState'
import { killEnemy } from './enemyDamage'
import type { Terrain } from './enemyMovement'
import { splitShotDamage } from './grapeShot'
import { flushGunHitsOn, tallyGunHit } from './gunHits'
import { isAnyEnemyWithinRangeCap, turretSightOf } from './gunTargets'
import { turretAimOf, type TurretAim } from './turretAim'
import { knockedEnemy } from './turretKnock'
import { turretShapeOf } from './turretShape'
import { vehicleTargetOf, type VehicleTarget } from './vehicleTarget'

/** One due shot, aimed: who fires it, from where, with which shape, at whom. */
interface TurretShot {
  playerId: string
  tick: number
  terrain: Terrain
  from: MillimetrePoint
  shape: TurretShape
  aim: TurretAim
}

/** One target's part of a shot: the damage it takes and the energy it is charged with. */
interface ShotPart {
  enemy: Enemy
  damage: BigStat
  energy: number
}

export function fireGun(
  state: AuthorityState,
  playerId: string,
  terrain: Terrain,
  tick: number,
): RuleEffect {
  const shot = dueShotOf(state, playerId, terrain, tick)
  if (shot === null) return unchanged(state)
  return chainEffects(state, [
    (current) => spendShot(current, shot),
    (current) => keepDirectorPick(current, shot),
    (current) => shootParts(current, shot),
    (current) => followEnergyChange(current, playerId, tick),
  ])
}

/** The shot this vehicle's guns fire this tick, or null when they hold fire. */
function dueShotOf(
  state: AuthorityState,
  playerId: string,
  terrain: Terrain,
  tick: number,
): TurretShot | null {
  if (!isGunDue(state, playerId, tick)) return null
  const target = vehicleTargetOf(state, playerId, tick)
  if (target === null || !isAnyEnemyWithinRangeCap(target, state.combat.enemies)) return null
  return aimedShotOf(state, terrain, target, tick)
}

/** The shape is read here, once per due shot with an enemy in reach, and nowhere else. */
function aimedShotOf(
  state: AuthorityState,
  terrain: Terrain,
  target: VehicleTarget,
  tick: number,
): TurretShot | null {
  const { playerId } = target
  const shape = turretShapeOf(state, playerId)
  const isConeOpen = isForwardConeOpen(vehicleOf(state, playerId), shape, tick)
  const sight = turretSightOf(terrain, target, shape, isConeOpen)
  const heldPick = combatVehicleOf(state.combat, playerId).directorPick
  const aim = turretAimOf(sight, state.combat.enemies, { shape, heldPick, tick })
  return aim === null ? null : { playerId, tick, terrain, from: target.position, shape, aim }
}

function isGunDue(state: AuthorityState, playerId: string, tick: number): boolean {
  const vehicle = vehicleOf(state, playerId)
  return (
    isVehicleActive(vehicle) &&
    isGunOnAuto(vehicle.gun) &&
    hasSteamForShot(vehicle) &&
    tick >= combatVehicleOf(state.combat, playerId).gunReadyTick &&
    burstPhaseOf(vehicle.gunBurst, tick) !== 'vent'
  )
}

function spendShot(state: AuthorityState, { playerId, tick, shape }: TurretShot): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  const fired = withVehicle(state, playerId, {
    ...vehicle,
    energy: vehicle.energy - shape.energyPerShotQuanta,
  })
  const interval = gunIntervalAt(vehicle.gunBurst, gunFireIntervalTicks(vehicle.gun.level), tick)
  const gunReadyTick = tick + interval
  return unchanged(withCombat(fired, withCombatVehicle(fired.combat, playerId, { gunReadyTick })))
}

/** The fire director remembers whom it ranked first; the nearest order keeps nothing. */
function keepDirectorPick(state: AuthorityState, { playerId, aim }: TurretShot): RuleEffect {
  if (aim.pick === null) return unchanged(state)
  const directorPick = aim.pick
  return unchanged(withCombat(state, withCombatVehicle(state.combat, playerId, { directorPick })))
}

function shootParts(state: AuthorityState, shot: TurretShot): RuleEffect {
  return chainEffects(
    state,
    shotPartsOf(state, shot).map((part) => (current) => shootEnemy(current, shot, part)),
  )
}

/** The shot's damage split over its targets (one with no grapeshot); the aimed one pays the energy. */
function shotPartsOf(state: AuthorityState, { playerId, shape, aim }: TurretShot): ShotPart[] {
  const targets = [aim.primary, ...aim.partners]
  const damage = gunShotDamage(vehicleOf(state, playerId).levels.drill_power)
  const shares = splitShotDamage(damage, targets.length)
  return targets.map((enemy, index) => ({
    enemy,
    damage: shares[index],
    energy: index === 0 ? shape.energyPerShotQuanta : 0,
  }))
}

/** The shot lands; a kill logs the guns' hits on the enemy first, then `enemy_killed {by: gun}`. */
function shootEnemy(state: AuthorityState, shot: TurretShot, part: ShotPart): RuleEffect {
  const { playerId, tick } = shot
  const { enemy, damage, energy } = part
  const hit = { ...enemy, health: sub(enemy.health, damage) }
  const isAlive = cmp(hit.health, ZERO_MONEY) > 0
  const after = isAlive ? knockedBy(shot, hit) : hit
  const next = tallyGunHit(withCombat(state, withEnemy(state.combat, after)), playerId, {
    enemyId: enemy.id,
    damage,
    energy,
  })
  if (isAlive) return unchanged(next)
  return chainEffects(next, [
    (current) => flushGunHitsOn(current, playerId, enemy.id),
    // Drill damage only pends on a pinned enemy, and a pinned enemy sits in front.
    (current) => killEnemy(current, hit, 'front', tick, 'gun'),
  ])
}

function knockedBy({ shape, terrain, from, tick }: TurretShot, enemy: Enemy): Enemy {
  return shape.knock === null ? enemy : knockedEnemy(terrain, from, enemy, shape.knock, tick)
}
