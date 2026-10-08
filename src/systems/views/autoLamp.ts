/**
 * The brass auto lamp (ticket 317, Gameplay on #310): dark while the item is off, green while it
 * is on and firing (or showing its locked target), amber while it holds, with a short label for
 * each hold so the player always sees why it is not firing. Read from the authority's mode and
 * hold, never from client input; text says it, never colour alone.
 */
import type { AuthorityState } from '../authority/authorityState'
import { autoModeOf } from '../authority/autoMode/autoModeState'
import type { AutoHoldReason } from '../registries/autoActors'

export type AutoLampColour = 'dark' | 'green' | 'amber'

export interface AutoLamp {
  colour: AutoLampColour
  label: string
  hold: AutoHoldReason | null
}

export const AUTO_HOLD_LABELS: Readonly<Record<AutoHoldReason, string>> = {
  docked: 'docked',
  inactive: 'rig down',
  anchored: 'anchored',
  collapse_warning: 'collapse warning',
  unavailable: 'not fitted',
  recovering: 'recovering',
  income_cap: 'trip cap reached',
  no_target: 'no target',
  energy_reserve: 'energy reserve',
  would_warn: 'would collapse here',
}

const OFF_LAMP: AutoLamp = { colour: 'dark', label: 'Off', hold: null }
const FIRING_LAMP: AutoLamp = { colour: 'green', label: 'Auto', hold: null }

export function autoLampOf(state: AuthorityState, playerId: string, itemId: string): AutoLamp {
  const mode = autoModeOf(state, playerId, itemId)
  if (mode === null) return OFF_LAMP
  if (mode.hold === null) return FIRING_LAMP
  return { colour: 'amber', label: `Auto: ${AUTO_HOLD_LABELS[mode.hold]}`, hold: mode.hold }
}
