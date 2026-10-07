/**
 * The sibling-link's switch on the #164 item card (the GD lock on #256: on by default, saved per
 * player, so a player saving their last smoke canister can turn it off). `toggle_link {itemId}`
 * flips it for an item whose Mark has reached its sibling-link, and logs `link_toggled`.
 */
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import {
  rejectionOf,
  type Rejection,
  type RuleEffect,
} from '../../../systems/authority/commandRule'
import { isLinkOn, powerUpStateOf, withLinkOn, withPowerUpState } from './chargeState'
import { linkToggledOf } from './powerUpEvents'
import { reachedSiblingLinkOf } from './siblingLink'

export function intentToToggleLink(itemId: string): CommandIntent<'power-up-core.toggle_link'> {
  return { type: 'power-up-core.toggle_link', payload: { itemId } }
}

export function linkToggleRefusalOf(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): Rejection | null {
  if (reachedSiblingLinkOf(state, playerId, itemId) !== null) return null
  return rejectionOf('power-up-core.no_sibling_link', `"${itemId}" has reached no sibling-link`)
}

export function toggleSiblingLink(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): RuleEffect {
  const value = powerUpStateOf(state, playerId)
  const isOn = !isLinkOn(value, itemId)
  return {
    state: withPowerUpState(state, playerId, withLinkOn(value, itemId, isOn)),
    events: [linkToggledOf(playerId, itemId, isOn)],
  }
}
