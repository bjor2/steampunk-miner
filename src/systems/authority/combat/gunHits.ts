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

/** One more shot of `damage` on `enemyId` in this vehicle's tally. */
export function tallyGunHit(
  state: AuthorityState,
  playerId: string,
  enemyId: string,
  damage: BigStat,
): AuthorityState {
  const hits = combatVehicleOf(state.combat, playerId).pendingGunHits
  const pendingGunHits = hits.some((hit) => hit.enemyId === enemyId)
    ? hits.map((hit) => (hit.enemyId === enemyId ? withOneMoreShot(hit, damage) : hit))
    : [...hits, { enemyId, damage, shots: 1 }]
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

function withOneMoreShot(hit: PendingGunHit, damage: BigStat): PendingGunHit {
  return { ...hit, damage: add(hit.damage, damage), shots: hit.shots + 1 }
}

function gunHitEventOf(hit: PendingGunHit): DomainEventBody {
  return {
    type: 'GunHit',
    enemyId: hit.enemyId,
    damage: toCanonical(hit.damage),
    shots: hit.shots,
    energy: hit.shots * GUN_SHOT_QUANTA,
  }
}
