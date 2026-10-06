/**
 * Who a charge's blast hurts (spec #109 "Back off", numbers, multiplayer): the planter's own
 * vehicle within the radius takes the self hit, `26 * 1.12^T` at the blast tile's enemy tier with no
 * front or side multiplier, and at 0 hull is wrecked with cause `blast`; other vehicles take none,
 * since a blast does no friendly damage. Every enemy within the radius takes twice its kind's
 * health at that tier. Distances are from the charge tile's centre to a body's centre.
 */
import { blastEnemyDamage, blastSelfHit, isInBlastRadius } from '../../economy/blastingCharges'
import { chargeCentreMm } from '../../vehicle/vehicleCharges'
import type { VehiclePose } from '../../vehicle/vehiclePose'
import { bandOfTile } from '../../world/planetGeometry'
import type { PlanetParams } from '../../world/planetParams'
import type { TilePoint } from '../../world/tileGrid'
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
  charge: TilePoint,
  tick: number,
): RuleEffect {
  const vehicle = vehicleOf(state, playerId)
  if (!isCrushable(vehicle) || !isPoseInBlast(vehicle.pose, charge)) return unchanged(state)
  const amount = blastSelfHit(params.planetIndex, bandOfTile(params, charge.tx, charge.ty))
  return chainEffects(state, [
    (current) => damageHullBy(current, playerId, amount, 'blast'),
    (current) => destroyIfHullGone(current, playerId, tick, 'blast'),
  ])
}

/** Each enemy's events concern the vehicle it hunts, as in the enemy tick. */
export function hitEnemiesInBlast(
  state: AuthorityState,
  params: PlanetParams,
  charge: TilePoint,
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

function isPoseInBlast(pose: VehiclePose | null, charge: TilePoint): boolean {
  return pose !== null && isPointInBlast(pose.x, pose.y, charge)
}

function isPointInBlast(xMm: number, yMm: number, charge: TilePoint): boolean {
  const centre = chargeCentreMm(charge)
  return isInBlastRadius(xMm - centre.xMm, yMm - centre.yMm)
}
