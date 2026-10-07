/**
 * The sensing passives' Mark 3 sibling-links (the GD lock on #256, build 5): an always-on item is
 * never pressed, so its link fires at a moment of its own, through power-up-core's
 * `fireSiblingLinkAt` and that link's rules (on, sibling slotted and ready, the sibling's own charge
 * and cooldown, the tile flash). Each fires only while the player owns the passive.
 *
 * - The threat periscope (the lock's worked example): an enemy within its radius starts its lunge's
 *   wind-up, the telegraph its warning shows (an authority clock step, after the enemy tick).
 * - The assay lens: the player's drill breaks into an ore cell (`TileDestroyed` of ore).
 * - The hazard barometer: a hazard comes into its lookahead, where there was none before the step.
 *   A reaction runs only for a player whose step raised events, so a hazard first seen while the
 *   miner drives with no event waits for the next drilling step that still sees none before.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { ownsItem } from '../../../systems/authority/loadoutRules'
import type { Enemy } from '../../../systems/authority/combat/combatState'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import type { ClockStep } from '../../../systems/registries/clockSteps'
import { MM_PER_METRE } from '../../../constants/physics'
import { tileOfPose, type VehiclePose } from '../../../systems/vehicle/vehiclePose'
import { fireSiblingLinkAt, reachedSiblingLinkOf } from '../../power-up-core'
import { researchedMarkOf } from '../../tech-tree'
import { barometerWarningsOf } from './hazardBarometer'
import { passiveReachOf } from './passiveReach'
import { ASSAY_LENS, HAZARD_BAROMETER, THREAT_PERISCOPE } from './passiveReads'
import { sensingItemOf } from './sensingCatalogue'

/** Runs on every live tick, after the enemy tick: enemies only move then, so it never wakes one. */
export const PERISCOPE_LINK_STEP: ClockStep = {
  id: 'sensing.periscope-link',
  nextTick: () => null,
  run: fireLungeWarnings,
}

export const LENS_LINK_REACTION: AuthorityReaction = {
  id: 'sensing.lens-link',
  react: (_before, after, heard) => fireOnOreBroken(after, heard),
}

export const BAROMETER_LINK_REACTION: AuthorityReaction = {
  id: 'sensing.barometer-link',
  react: (before, after, heard) => fireOnFreshHazard(before, after, heard),
}

function fireLungeWarnings(state: AuthorityState, tick: number): RuleEffect {
  return chainEffects(
    state,
    playerIdsOf(state).map(
      (playerId) => (current: AuthorityState) => fireOnLungeWarning(current, playerId, tick),
    ),
  )
}

function fireOnLungeWarning(state: AuthorityState, playerId: string, tick: number): RuleEffect {
  const pose = linkedPassivePoseOf(state, playerId, THREAT_PERISCOPE)
  if (pose === null || !isLungeWarnedAt(state, playerId, pose, tick)) return unchanged(state)
  return fireFrom(state, playerId, THREAT_PERISCOPE, pose, tick)
}

/** An enemy within the periscope's radius started its wind-up this tick. */
function isLungeWarnedAt(
  state: AuthorityState,
  playerId: string,
  pose: VehiclePose,
  tick: number,
): boolean {
  const radiusMm = reachOf(state, playerId, THREAT_PERISCOPE) * MM_PER_METRE
  return state.combat.enemies.some(
    (enemy) => isWindingUpFrom(enemy, tick) && isWithinMm(pose, enemy, radiusMm),
  )
}

function isWindingUpFrom(enemy: Enemy, tick: number): boolean {
  return enemy.phase === 'windup' && enemy.phaseSinceTick === tick
}

function isWithinMm(pose: VehiclePose, enemy: Enemy, radiusMm: number): boolean {
  const dx = enemy.x - pose.x
  const dy = enemy.y - pose.y
  return dx * dx + dy * dy <= radiusMm * radiusMm
}

function fireOnOreBroken(state: AuthorityState, heard: readonly DomainEvent[]): RuleEffect {
  const broken = heard.find(isOreBrokenByDrill)
  if (broken?.playerId === undefined) return unchanged(state)
  const pose = linkedPassivePoseOf(state, broken.playerId, ASSAY_LENS)
  if (pose === null) return unchanged(state)
  return fireFrom(state, broken.playerId, ASSAY_LENS, pose, broken.tick)
}

function isOreBrokenByDrill(event: DomainEvent): boolean {
  return event.type === 'TileDestroyed' && event.kind === 'ore' && event.cause === undefined
}

function fireOnFreshHazard(
  before: AuthorityState,
  after: AuthorityState,
  heard: readonly DomainEvent[],
): RuleEffect {
  const last = heard[heard.length - 1]
  if (last?.playerId === undefined) return unchanged(after)
  const pose = linkedPassivePoseOf(after, last.playerId, HAZARD_BAROMETER)
  if (pose === null || !isHazardFresh(before, after, last.playerId)) return unchanged(after)
  return fireFrom(after, last.playerId, HAZARD_BAROMETER, pose, last.tick)
}

/** Warned of now, and of nothing when the step began. */
function isHazardFresh(before: AuthorityState, after: AuthorityState, playerId: string): boolean {
  const lookahead = reachOf(after, playerId, HAZARD_BAROMETER)
  if (barometerWarningsOf(after, playerId, lookahead).length === 0) return false
  return barometerWarningsOf(before, playerId, lookahead).length === 0
}

/** The miner's pose while it owns the passive and its link is researched; null otherwise. */
function linkedPassivePoseOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): VehiclePose | null {
  if (reachedSiblingLinkOf(state, playerId, itemId) === null) return null
  if (!ownsItem(state, playerId, itemId)) return null
  return vehicleOf(state, playerId).pose
}

function fireFrom(
  state: AuthorityState,
  playerId: string,
  itemId: string,
  pose: VehiclePose,
  tick: number,
): RuleEffect {
  return fireSiblingLinkAt(state, { playerId, itemId, tick, origin: tileOfPose(pose) })
}

function reachOf(state: AuthorityState, playerId: string, itemId: string): number {
  const item = sensingItemOf(itemId)
  return item === null ? 0 : passiveReachOf(item, researchedMarkOf(state, playerId, itemId))
}

/** Sorted, so two players fire in the same order on every machine. */
function playerIdsOf(state: AuthorityState): string[] {
  return Object.keys(state.players).sort()
}
