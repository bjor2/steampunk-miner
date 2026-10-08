/**
 * Switching an item's auto mode (ticket 317, the #310 GD decision): every item's `set_auto` is
 * refused, with nothing spent, until the player has researched the node that unlocks the item
 * (the steam sear for the bore gun, and the same rule for every later weapon). On, the item joins
 * the player's modes with no preview and no hold until the clock looks; off, it leaves them. A
 * switch that changes nothing is accepted quietly, so only a real switch clicks the valve.
 */
import { isVehicleItemResearched } from '../../registries/vehicleItemSales'
import type { AuthorityState } from '../authorityState'
import { rejectionOf, type Rejection, type RuleEffect } from '../commandRule'
import {
  isAutoModeOn,
  modesWith,
  modesWithout,
  switchedOnMode,
  withPlayerAutoModes,
} from './autoModeState'

export function autoToggleRefusal(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): Rejection | null {
  if (isVehicleItemResearched(state, playerId, itemId)) return null
  return rejectionOf(
    'not_researched',
    `the node that unlocks ${itemId}'s auto mode is not researched`,
  )
}

export function switchAutoModeOn(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): RuleEffect {
  if (isAutoModeOn(state, playerId, itemId)) return { state, events: [] }
  const modes = modesWith(state, playerId, switchedOnMode(itemId))
  return switchedTo(withPlayerAutoModes(state, playerId, modes), itemId, true)
}

export function switchAutoModeOff(
  state: AuthorityState,
  playerId: string,
  itemId: string,
): RuleEffect {
  if (!isAutoModeOn(state, playerId, itemId)) return { state, events: [] }
  const modes = modesWithout(state, playerId, itemId)
  return switchedTo(withPlayerAutoModes(state, playerId, modes), itemId, false)
}

function switchedTo(state: AuthorityState, itemId: string, isOn: boolean): RuleEffect {
  return { state, events: [{ type: 'AutoModeSet', itemId, isOn }] }
}
