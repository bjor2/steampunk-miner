/**
 * The charged signature modules spend and restock (ticket 380, the TD lock on #318). Spending is an
 * authority reaction to the shot the kernel fired, read off what it really carries rather than
 * worked out again: a fired line whose shot lays a lining spent a cementing round, one that grounds
 * spent the earthing spike's wait, and every strut the kernel wedged (`StrutPlaced`) spent a strut.
 * Each spent charge is logged with the charges left (`ground-gun.ModuleChargeSpent`).
 *
 * Restocking is a dock service (#217): the paid recharge puts every spent charge back, free and off
 * the bill, logged as `ground-gun.ModuleChargesRefilled` with the charges after, so a balance read
 * tells a free restock from a paid buy. The waits between uses run on through a dock.
 */
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { boresOf } from '../../../systems/authority/bore/boreState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent, DomainEventBody } from '../../../systems/authority/domainEvent'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import type { DockService } from '../../../systems/registries/dockServices'
import { CEMENTING_ROUND_ITEM_ID, EARTHING_SPIKE_ITEM_ID, STRUT_BORE_ITEM_ID } from './boreGunLane'
import { ownedModuleMarkOf } from './boreGunModules'
import {
  chargedModuleIds,
  chargesLeftOf,
  dockChargesAt,
  moduleUsesOf,
  withChargesRestocked,
  withModuleUsed,
} from './moduleUse'

declare module '../../../systems/authority/domainEvent' {
  interface DomainEventBodies {
    /** A charged module acted on a shot: `chargesLeft` this dock after it. */
    'ground-gun.ModuleChargeSpent': { itemId: string; chargesLeft: number }
    /** The dock's recharge restocked a charged module, free: `chargesLeft` after. */
    'ground-gun.ModuleChargesRefilled': { itemId: string; chargesLeft: number }
  }
}

export const MODULE_USE_REACTION: AuthorityReaction = {
  id: 'ground-gun.module-use',
  react: (_before, after, events) => spendUsedModules(after, events),
}

export const MODULE_RESTOCK_SERVICE: DockService = {
  id: 'ground-gun.module-restock',
  onRecharge: restockModulesAtDock,
}

/** One module acting on one shot. */
interface ModuleAct {
  itemId: string
  tick: number
}

function spendUsedModules(after: AuthorityState, events: readonly DomainEvent[]): RuleEffect {
  const playerId = events[0]?.playerId
  if (playerId === undefined || !Object.hasOwn(after.players, playerId)) return unchanged(after)
  const acts = moduleActsOf(after, playerId, events)
  return chainEffects(
    after,
    acts.map((act) => (state: AuthorityState) => spendModule(state, playerId, act)),
  )
}

/** The modules that acted on the heard shots and struts, in event order. */
export function moduleActsOf(
  after: AuthorityState,
  playerId: string,
  events: readonly DomainEvent[],
): ModuleAct[] {
  return events.flatMap((event) => {
    if (event.type === 'StrutPlaced') return [{ itemId: STRUT_BORE_ITEM_ID, tick: event.tick }]
    if (event.type === 'BoreFired') return firedShotActsOf(after, playerId, event.tick)
    return []
  })
}

/** What the shot fired at `tick` carries: a lining spends a round, grounding the spike's wait. */
function firedShotActsOf(after: AuthorityState, playerId: string, tick: number): ModuleAct[] {
  const shot = boresOf(after).find(
    (bore) => bore.playerId === playerId && bore.firedTick === tick,
  )?.shot
  if (shot === undefined) return []
  return [
    ...(shot.liningType === undefined ? [] : [{ itemId: CEMENTING_ROUND_ITEM_ID, tick }]),
    ...(shot.groundTicks === undefined ? [] : [{ itemId: EARTHING_SPIKE_ITEM_ID, tick }]),
  ]
}

function spendModule(state: AuthorityState, playerId: string, act: ModuleAct): RuleEffect {
  const mark = ownedModuleMarkOf(state, playerId, act.itemId)
  if (mark === 0) return unchanged(state)
  const spent = withModuleUsed(state, playerId, { ...act, mark })
  const chargesLeft = chargesLeftOf(spent, playerId, act.itemId, mark)
  if (chargesLeft === null) return unchanged(spent)
  return { state: spent, events: [chargeSpentOf(act.itemId, chargesLeft)] }
}

function restockModulesAtDock(state: AuthorityState, playerId: string): RuleEffect {
  const spentIds = chargedModuleIds().filter(
    (itemId) => (moduleUsesOf(state, playerId)[itemId]?.spent ?? 0) > 0,
  )
  return chainEffects(
    state,
    spentIds.map((itemId) => (current: AuthorityState) => restockModule(current, playerId, itemId)),
  )
}

function restockModule(state: AuthorityState, playerId: string, itemId: string): RuleEffect {
  const mark = ownedModuleMarkOf(state, playerId, itemId)
  if (mark === 0) return unchanged(state)
  return {
    state: withChargesRestocked(state, playerId, itemId),
    events: [chargesRefilledOf(itemId, dockChargesAt(itemId, mark) ?? 0)],
  }
}

function chargeSpentOf(itemId: string, chargesLeft: number): DomainEventBody {
  return { type: 'ground-gun.ModuleChargeSpent', itemId, chargesLeft }
}

function chargesRefilledOf(itemId: string, chargesLeft: number): DomainEventBody {
  return { type: 'ground-gun.ModuleChargesRefilled', itemId, chargesLeft }
}
