/**
 * The guns' hits as the log sees them (#107 "Logging and tests"): shots are counted per pose
 * report, never one line a shot. Each vehicle tallies its hits per enemy; its next pose report,
 * the shot that kills an enemy, or the end of its trip logs the tally as one `GunHit` per enemy
 * with the energy those shots took, so a dive's gun energy is the sum of its `gun_hit` lines.
 */
import { add, toCanonical, type BigStat } from '../../money'
import { GUN_SHOT_QUANTA } from '../../vehicle/energyQuanta'
import { withCombat, type AuthorityState } from '../authorityState'
import { unchanged, type RuleEffect } from '../commandRule'
import type { DomainEventBody } from '../domainEvent'
import { combatVehicleOf, withCombatVehicle, type PendingGunHit } from './combatState'

/** One shot's hit on one enemy: what it dealt and the energy quanta it is charged with. */
export interface GunShotHit {
  enemyId: string
  damage: BigStat
  energy: number
}

/** One more shot on the enemy in this vehicle's tally. */
export function tallyGunHit(state: AuthorityState, playerId: string, shot: GunShotHit) {
  const hits = combatVehicleOf(state.combat, playerId).pendingGunHits
  const pendingGunHits = hits.some((hit) => hit.enemyId === shot.enemyId)
    ? hits.map((hit) => (hit.enemyId === shot.enemyId ? withOneMoreShot(hit, shot) : hit))
    : [...hits, firstShotOf(shot)]
  return withCombat(state, withCombatVehicle(state.combat, playerId, { pendingGunHits }))
}

/** Logs every hit this vehicle's guns have not logged yet. */
export function flushGunHits(state: AuthorityState, playerId: string): RuleEffect {
  return flushGunHitsWhere(state, playerId, () => true)
}

/** Logs this vehicle's hits on one enemy, before its kill is logged. */
export function flushGunHitsOn(
  state: AuthorityState,
  playerId: string,
  enemyId: string,
): RuleEffect {
  return flushGunHitsWhere(state, playerId, (hit) => hit.enemyId === enemyId)
}

function flushGunHitsWhere(
  state: AuthorityState,
  playerId: string,
  isFlushed: (hit: PendingGunHit) => boolean,
): RuleEffect {
  const hits = combatVehicleOf(state.combat, playerId).pendingGunHits
  const flushed = hits.filter(isFlushed)
  if (flushed.length === 0) return unchanged(state)
  const kept = hits.filter((hit) => !isFlushed(hit))
  return {
    state: withCombat(state, withCombatVehicle(state.combat, playerId, { pendingGunHits: kept })),
    events: flushed.map(gunHitEventOf),
  }
}

/** Energy is kept only once a shot cost other than a full one, so #107's tallies stay as they were. */
function firstShotOf({ enemyId, damage, energy }: GunShotHit): PendingGunHit {
  const first = { enemyId, damage, shots: 1 }
  return energy === GUN_SHOT_QUANTA ? first : { ...first, energy }
}

function withOneMoreShot(hit: PendingGunHit, shot: GunShotHit): PendingGunHit {
  const more = { ...hit, damage: add(hit.damage, shot.damage), shots: hit.shots + 1 }
  if (hit.energy === undefined && shot.energy === GUN_SHOT_QUANTA) return more
  return { ...more, energy: energyOf(hit) + shot.energy }
}

function energyOf(hit: PendingGunHit): number {
  return hit.energy ?? hit.shots * GUN_SHOT_QUANTA
}

function gunHitEventOf(hit: PendingGunHit): DomainEventBody {
  return {
    type: 'GunHit',
    enemyId: hit.enemyId,
    damage: toCanonical(hit.damage),
    shots: hit.shots,
    energy: energyOf(hit),
  }
}
