/**
 * Who a charge's blast hurts (spec #109 "Back off", numbers, multiplayer; sizes #153, #143, K8
 * #218): the planter's own vehicle within the radius takes the self hit, `26 * 1.12^T * r(n)/r(1)`
 * at the blast tile's enemy tier with no front or side multiplier, or, from size 4, its whole hull
 * inside the inner half of the radius; at 0 hull it is wrecked with cause `blast`. Other vehicles
 * take none, since a blast does no friendly damage. Every enemy within the radius takes twice its
 * kind's health at that tier. Distances are from the charge tile's centre to a body's centre.
 */
import { blastEnemyDamage, blastSelfHit } from '../../economy/blastingCharges'
import { hasLethalCore, isInChargeRadius, isInLethalCore } from '../../economy/chargeSizes'
import type { BigStat } from '../../money'
import { chargeCentreMm, type PlantedCharge } from '../../vehicle/vehicleCharges'
import type { VehiclePose } from '../../vehicle/vehiclePose'
import type { VehicleState } from '../../vehicle/vehicleState'
import { bandOfTile } from '../../world/planetGeometry'
import type { PlanetParams } from '../../world/planetParams'
import { vehicleOf, type AuthorityState } from '../authorityState'
import { isCrushable } from '../collapse/collapseCrush'
import { stampedFor, type TickOutcome } from '../combat/combatTick'
import { blastEnemy } from '../combat/enemyDamage'
import { chainEffects, unchanged, type RuleEffect } from '../commandRule'
import { damageHullBy } from '../hullDamage'
import { destroyIfHullGone } from '../vehicleTransitions'

export function hitPlanterInBlast(
  state: AuthorityState,
  params: PlanetParams,
  playerId: string,
  charge: PlantedCharge,
  tick: number,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (!isCrushable(vehicle) || !isPoseInBlast(vehicle.pose, charge)) return unchanged(state)
  const amount = selfHitOf(params, vehicle, charge)
  return chainEffects(state, [
    (current) => damageHullBy(current, playerId, amount, 'blast'),
    (current) => destroyIfHullGone(current, playerId, tick, 'blast'),
  ])
}

/** Each enemy's events concern the vehicle it hunts, as in the enemy tick. */
export function hitEnemiesInBlast(
  state: AuthorityState,
  params: PlanetParams,
  charge: PlantedCharge,
  tick: number,
): TickOutcome {
  const band = bandOfTile(params, charge.tx, charge.ty)
  const caught = state.combat.enemies.filter((enemy) => isPointInBlast(enemy.x, enemy.y, charge))
  return caught.reduce<TickOutcome>(
    (outcome, enemy) => {
      const amount = blastEnemyDamage(enemy.kind, params.planetIndex, band)
      const next = stampedFor(blastEnemy(outcome.state, enemy, amount, tick), enemy.ownerId, tick)
      return { state: next.state, events: [...outcome.events, ...next.events] }
    },
    { state, events: [] },
  )
}

/** The whole hull inside a lethal core, else the size's self hit at the blast tile's band. */
function selfHitOf(params: PlanetParams, vehicle: VehicleState, charge: PlantedCharge): BigStat {
  if (isPoseInLethalCore(vehicle.pose as VehiclePose, charge)) return vehicle.hull
  return blastSelfHit(params.planetIndex, bandOfTile(params, charge.tx, charge.ty), charge.size)
}

function isPoseInBlast(pose: VehiclePose | null, charge: PlantedCharge): boolean {
  return pose !== null && isPointInBlast(pose.x, pose.y, charge)
}

function isPoseInLethalCore(pose: VehiclePose, charge: PlantedCharge): boolean {
  const centre = chargeCentreMm(charge)
  return (
    hasLethalCore(charge.size) &&
    isInLethalCore(charge.size, pose.x - centre.xMm, pose.y - centre.yMm)
  )
}

function isPointInBlast(xMm: number, yMm: number, charge: PlantedCharge): boolean {
  const centre = chargeCentreMm(charge)
  return isInChargeRadius(charge.size, xMm - centre.xMm, yMm - centre.yMm)
}
