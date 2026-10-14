/**
 * One auto switch for the rig (ticket 328, Gameplay on #328): #317's toggle, `ground_gun.set_auto`
 * on the steam sear, also switches the self-acting steam shield, so the player has one switch and
 * one lamp rather than one per combo. The shield follows each sear switch the authority accepts,
 * in the same answer: on only while its own node is researched (every item's `set_auto` rule,
 * `autoToggleRefusal`), off always. A switch that changes nothing raises nothing, as the core's.
 */
import { STEAM_SEAR_ITEM_ID } from '../../../systems/authority/bore/boreFire'
import {
  autoToggleRefusal,
  switchAutoModeOff,
  switchAutoModeOn,
} from '../../../systems/authority/autoMode/autoToggle'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { chainEffects, unchanged, type RuleEffect } from '../../../systems/authority/commandRule'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import type { AuthorityReaction } from '../../../systems/registries/authorityReactions'
import { MOBILITY_ITEM } from './itemIds'

const SHIELD = MOBILITY_ITEM.steamShield

interface SearSwitch {
  playerId: string
  isOn: boolean
}

export const SHARED_AUTO_SWITCH: AuthorityReaction = {
  id: 'mobility.shield-follows-sear-switch',
  react: (_before, after, heard) => followSearSwitches(after, heard),
}

function followSearSwitches(state: AuthorityState, heard: readonly DomainEvent[]): RuleEffect {
  return chainEffects(
    state,
    searSwitchesIn(heard).map((change) => (current) => switchShieldLike(current, change)),
  )
}

function searSwitchesIn(heard: readonly DomainEvent[]): SearSwitch[] {
  return heard.flatMap((event) =>
    event.type === 'AutoModeSet' && event.itemId === STEAM_SEAR_ITEM_ID && event.playerId
      ? [{ playerId: event.playerId, isOn: event.isOn }]
      : [],
  )
}

function switchShieldLike(state: AuthorityState, { playerId, isOn }: SearSwitch): RuleEffect {
  if (!isOn) return switchAutoModeOff(state, playerId, SHIELD)
  if (autoToggleRefusal(state, playerId, SHIELD) !== null) return unchanged(state)
  return switchAutoModeOn(state, playerId, SHIELD)
}
