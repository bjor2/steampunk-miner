/**
 * The Vent Vane's outcome (ticket 882, PK4c T2; the GD's final lock on #850 and Systems' vane
 * correction 6395074595, which replaced the 1500 bp lift row): while the vane acts, a vent's shove
 * is turned outward from the core (the kernel's `shoveAims`), kept at the vaned size, the row's
 * `shoveTiles` scaled by the vane's −60% factor, over the row's 20 ticks. There is no `liftBp`:
 * the vaned shove is never longer than the bare one, so a vaned rig never climbs out over a vent
 * faster (the VS's no-net-speed row). `VaneRidden` logs each vaned shove as `vane_ride`.
 */
import { vehicleOf, type AuthorityState } from '../../../systems/authority/authorityState'
import { unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent, DomainEventBody } from '../../../systems/authority/domainEvent'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import type { ShoveAim } from '../../../systems/registries/shoveAims'
import { isToolActing } from '../../../systems/vehicle/actingTools'
import { actingToolWithVerb } from './kitToolRules'
import './kitOutcomeEvents'

const VANE = actingToolWithVerb('aim_outward')

/** The vane turns its hazard's shoves outward while it acts. */
export const VANE_SHOVE_AIM: ShoveAim = {
  id: VANE.toolId,
  kind: VANE.hazard,
  isAimedOutward: (state, playerId) => isToolActing(vehicleOf(state, playerId), VANE.toolId),
}

export const VANE_RIDE_REACTION: AuthorityReaction = {
  id: 'planet-kit.vane-ride',
  react: (_before, after, heard) => recordVaneRides(after, heard),
}

type ShoveHeard = Extract<DomainEvent, { type: 'HazardShoved' }> & { playerId: string }

function recordVaneRides(state: AuthorityState, heard: readonly DomainEvent[]): RuleEffect {
  const rides = heard.filter((event) => isVanedShove(state, event)).map(vaneRiddenOf)
  return rides.length === 0 ? unchanged(state) : { state, events: rides }
}

/** A shove of the vane's hazard on a rig whose vane acts: the kernel aimed it outward. */
function isVanedShove(state: AuthorityState, event: DomainEvent): event is ShoveHeard {
  if (event.type !== 'HazardShoved' || event.kind !== VANE.hazard) return false
  const { playerId } = event
  if (playerId === undefined || !Object.hasOwn(state.players, playerId)) return false
  return isToolActing(vehicleOf(state, playerId), VANE.toolId)
}

function vaneRiddenOf(shove: ShoveHeard): DomainEventBody {
  return {
    type: 'planet-kit.VaneRidden',
    playerId: shove.playerId,
    tx: shove.tx,
    ty: shove.ty,
    tiles: shove.tiles,
    toTx: shove.toTx,
    toTy: shove.toTy,
  }
}
