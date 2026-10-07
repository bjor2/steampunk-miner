/**
 * What a paid recharge also does at the dock (#217, the #200 seam lock): a slice refills its own
 * state, such as power-up charges, as a free side-effect of the recharge bill. The bill never
 * changes; a service logs what it refilled (charges-after) so a balance read can tell a free
 * refill from a paid buy. Services run in id order at the end of `rechargeEnergy` and of quick
 * service's recharge leg. With nothing registered a recharge is what it was.
 */
import type { AuthorityState } from '../authority/authorityState'
import { chainEffects, type RuleEffect } from '../authority/commandRule'
import { defineRegistry, entriesOf } from './seal'

export interface DockService {
  id: string
  onRecharge(state: AuthorityState, playerId: string): RuleEffect
}

export const DOCK_SERVICE_REGISTRY = defineRegistry<DockService>('dockServices')

/** Every service in id order, each on the state the one before left. */
export function applyDockServicesOnRecharge(state: AuthorityState, playerId: string): RuleEffect {
  return chainEffects(
    state,
    entriesOf(DOCK_SERVICE_REGISTRY).map(
      (service) => (current: AuthorityState) => service.onRecharge(current, playerId),
    ),
  )
}
