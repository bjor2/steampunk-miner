/**
 * The HUD's bore gun auto readout (ticket 317, Gameplay on #310): the brass lamp's colour and its
 * label with the toggle's key, "Auto (T)", "Auto: no target (T)" or "Off (T)". Shown once the
 * steam sear is researched (or while the mode is on), never before. The fire tile's own lamp
 * (#314) reads the same `autoLampOf`.
 */
import { isAutoModeOn } from '../authority/autoMode/autoModeState'
import { autoToggleRefusal } from '../authority/autoMode/autoToggle'
import type { AuthorityState } from '../authority/authorityState'
import { STEAM_SEAR_ITEM_ID } from '../authority/bore/boreFire'
import { boundLabel, type Bindings } from '../input/actionMap'
import { autoLampOf, type AutoLamp } from './autoLamp'

export interface BoreAutoReading extends AutoLamp {
  text: string
}

/** Null until the sear's node is researched. */
export function boreAutoReadingOf(
  state: AuthorityState,
  playerId: string,
  bindings: Bindings,
): BoreAutoReading | null {
  const isOn = isAutoModeOn(state, playerId, STEAM_SEAR_ITEM_ID)
  if (!isOn && autoToggleRefusal(state, playerId, STEAM_SEAR_ITEM_ID) !== null) return null
  const lamp = autoLampOf(state, playerId, STEAM_SEAR_ITEM_ID)
  return { ...lamp, text: `${lamp.label} (${boundLabel(bindings, 'toggle_auto_fire')})` }
}
