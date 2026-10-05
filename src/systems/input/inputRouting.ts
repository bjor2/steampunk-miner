/**
 * What a pressed action does (#33 section 1): input produces either the vehicle intent (held
 * actions, `buildIntent`) or, on a press, one reaction from this table. A reaction that changes
 * the world is an ordinary authority command; the rest move UI state. Nothing here mutates state.
 *
 * Contexts are layers: `settings` over everything, then `platform` while docked (the screen is
 * open exactly then), else `vehicle`. Escape closes the top layer: settings, then the platform
 * screen (that is `Undock`), and in `vehicle` it opens settings. An action outside its context, a
 * dock the authority would refuse, the quick action away from the Sell bay (#37, #40) and a tow
 * call while the vehicle can still move do nothing and are not buffered.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import { dockCommand, quickServiceCommand, undockCommand } from '../platform/platformCommands'
import { requestRescueCommand } from '../vehicle/vehicleCommands'
import type { VehicleMode } from '../vehicle/vehicleState'
import type { BayId } from '../world/dockBays'
import type { ActionId, InputContext } from './actionMap'

export type InputReaction =
  | { kind: 'submit'; intent: CommandIntent }
  | { kind: 'openSettings' }
  | { kind: 'closeSettings' }
  | { kind: 'moveFocus'; step: -1 | 1 }
  | { kind: 'jumpPanel'; step: -1 | 1 }
  | { kind: 'activateFocused' }
  | { kind: 'none' }

/** What the routing needs to know about the session; read from the authority replica. */
export interface InputSituation {
  layer: InputContext
  vehicleMode: VehicleMode
  /** The bay `canDock` holds for (#23, #37): the dock prompt shows, and `interact` docks, there. */
  dockableBay: BayId | null
  /** The bay the vehicle is docked at; null while it is not docked. */
  dockedBay: BayId | null
}

type ReactionRule = (situation: InputSituation) => InputReaction

const NONE: InputReaction = { kind: 'none' }

const MENU_REACTIONS: Readonly<Partial<Record<ActionId, ReactionRule>>> = {
  ui_up: () => ({ kind: 'moveFocus', step: -1 }),
  ui_left: () => ({ kind: 'moveFocus', step: -1 }),
  ui_down: () => ({ kind: 'moveFocus', step: 1 }),
  ui_right: () => ({ kind: 'moveFocus', step: 1 }),
  ui_prev_panel: () => ({ kind: 'jumpPanel', step: -1 }),
  ui_next_panel: () => ({ kind: 'jumpPanel', step: 1 }),
  ui_confirm: () => ({ kind: 'activateFocused' }),
}

const REACTIONS_BY_LAYER: Readonly<
  Record<InputContext, Readonly<Partial<Record<ActionId, ReactionRule>>>>
> = {
  vehicle: {
    interact: ({ dockableBay }) => (dockableBay === null ? NONE : submit(dockCommand(dockableBay))),
    request_rescue: ({ vehicleMode }) =>
      isWaitingForTow(vehicleMode) ? submit(requestRescueCommand()) : NONE,
    open_settings: () => ({ kind: 'openSettings' }),
  },
  platform: {
    ...MENU_REACTIONS,
    quick_service: ({ dockedBay }) => (dockedBay === 'sell' ? submit(quickServiceCommand()) : NONE),
    ui_cancel: () => submit(undockCommand()),
  },
  settings: {
    ...MENU_REACTIONS,
    ui_cancel: () => ({ kind: 'closeSettings' }),
  },
}

export function reactionToPress(action: ActionId, situation: InputSituation): InputReaction {
  return REACTIONS_BY_LAYER[situation.layer][action]?.(situation) ?? NONE
}

/** The layer input goes to: the settings overlay, else the dock screen while docked. */
export function topLayerOf(vehicleMode: VehicleMode, isSettingsOpen: boolean): InputContext {
  if (isSettingsOpen) return 'settings'
  return vehicleMode === 'docked' ? 'platform' : 'vehicle'
}

/** `request_rescue` is live only for a vehicle that cannot move on its own (#7). */
function isWaitingForTow(mode: VehicleMode): boolean {
  return mode === 'stranded' || mode === 'destroyed'
}

function submit(intent: CommandIntent): InputReaction {
  return { kind: 'submit', intent }
}
