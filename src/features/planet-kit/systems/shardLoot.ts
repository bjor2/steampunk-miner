/**
 * The Shard Tongs' outcome (ticket 882, PK4c T2; the GD's lock on #850 and Systems' row
 * 6395065669): while the tongs act, each spinecrystal cluster the drill breaks drops as loot
 * instead of shattering. Its worth is the cell's normal yield, which the cut already carried to
 * the hold: no shatter loss, no new item and no value added, so money per minute moves only
 * through the time the −60% bite saves. The tongs close on it (#883's pose) and `ShardLooted`
 * logs it as `shard_looted`, once a cell, as the bite plays once a cell.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent, DomainEventBody } from '../../../systems/authority/domainEvent'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import { isToolActing } from '../../../systems/vehicle/actingTools'
import { actingToolWithVerb } from './kitToolRules'
import './kitOutcomeEvents'

const TONGS = actingToolWithVerb('loot')

export const SHARD_LOOT_REACTION: AuthorityReaction = {
  id: 'planet-kit.shard-loot',
  react: (_before, after, heard) => lootBittenShards(after, heard),
}

function lootBittenShards(state: AuthorityState, heard: readonly DomainEvent[]): RuleEffect {
  const looted = heard.filter((event) => isTongedBite(state, event)).map(shardLootedOf)
  return looted.length === 0 ? unchanged(state) : { state, events: looted }
}

/** A bite of the tongs' hazard on a rig whose tongs act. */
function isTongedBite(
  state: AuthorityState,
  event: DomainEvent,
): event is Extract<DomainEvent, { type: 'HazardBit' }> & { playerId: string } {
  if (event.type !== 'HazardBit' || event.kind !== TONGS.hazard) return false
  const { playerId } = event
  if (playerId === undefined || !Object.hasOwn(state.players, playerId)) return false
  return isToolActing(vehicleOf(state, playerId), TONGS.toolId)
}

function shardLootedOf(bite: { playerId: string; tx: number; ty: number }): DomainEventBody {
  return { type: 'planet-kit.ShardLooted', playerId: bite.playerId, tx: bite.tx, ty: bite.ty }
}
