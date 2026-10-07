/**
 * What a pressed action does (#33 section 1): input produces either the vehicle intent (held
 * actions, `buildIntent`) or, on a press, one reaction from this table. A reaction that changes
 * the world is an ordinary authority command; the rest move UI state. Nothing here mutates state.
 *
 * Contexts are layers: `settings` over everything, then the artefact cache's cards while open
 * (#46), then a slice's full screen while one is open (ticket 211), then `platform` while docked
 * (the screen is open exactly then), else `vehicle`. Escape closes the top layer: settings, the
 * cards (no pick, the cache stays live), the slice screen, then the platform screen (that is
 * `Undock`), and in `vehicle` it opens settings. `interact` opens a live cache the
 * vehicle is over, else docks. An action outside its context, a dock or open the authority would
 * refuse, the quick action away from the shops (#37, #40, #170), a tow call while the vehicle can
 * still move, the guns' toggle with no guns mounted (#107), a charge the authority would not
 * plant (#109: none carried, one live, no wall ahead) and a size step with fewer than two sizes in
 * the rack (K8 #218) do nothing and are not buffered.
 *
 * An action with no rule here in the top layer asks the slices' input reactions (#217): the
 * power-up slots' `use_slot_N` submit the slice's use command, or do nothing on an empty slot.
 */
import type { CommandIntent } from '../authority/authorityCommand'
import type { AuthorityState } from '../authority/authorityState'
import { openArtefactCacheCommand } from '../artefacts/artefactCommands'
import { isShopBay } from '../authority/dockRules'
import { dockCommand, quickServiceCommand, undockCommand } from '../platform/platformCommands'
import {
  plantChargeCommand,
  requestRescueCommand,
  setGunModeCommand,
} from '../vehicle/vehicleCommands'
import { toggledGunMode, type GunMode } from '../vehicle/vehicleGun'
import { sliceIntentOfPress } from '../registries/inputReactions'
import type { ZoomChange } from '../render/viewZoom'
import type { VehicleMode } from '../vehicle/vehicleState'
import type { BayId } from '../world/dockBays'
import type { ActionId, InputContext } from './actionMap'

export type InputReaction =
  | { kind: 'submit'; intent: CommandIntent }
  | { kind: 'openSettings' }
  | { kind: 'closeSettings' }
  | { kind: 'closeArtefactChoice' }
  | { kind: 'dismissScreen' }
  | { kind: 'moveFocus'; step: -1 | 1 }
  | { kind: 'activateFocused' }
  | { kind: 'zoom'; change: ZoomChange }
  /** `next_charge_size` (#153, K8 #218): the size `plant_charge` plants next. */
  | { kind: 'chooseChargeSize'; size: number }
  | { kind: 'none' }

/** What the routing needs to know about the session; read from the authority replica. */
export interface InputSituation {
  layer: InputContext
  vehicleMode: VehicleMode
  /** The bay `canDock` holds for (#23, #37): the dock prompt shows, and `interact` docks, there. */
  dockableBay: BayId | null
  /** The bay the vehicle is docked at; null while it is not docked. */
  dockedBay: BayId | null
  /** `canOpenArtefactCache` (#46): the cache prompt shows, and `interact` opens it, exactly then. */
  canOpenArtefactCache: boolean
  /** The guns' mode, or null with no guns mounted: then `toggle_guns` does nothing (#107). */
  gunMode: GunMode | null
  /** The size `plant_charge` plants when `plantRefusal` is null for it (#109, #218); else null. */
  plantableChargeSize: number | null
  /** The size `next_charge_size` steps to; null while the rack holds fewer than two sizes. */
  nextChargeSize: number | null
  /** The authority replica and the local player, for the slices' input reactions (#217). */
  state: AuthorityState
  playerId: string
}

/** The overlays that sit above the vehicle or platform layer when open. */
export interface OpenOverlays {
  isSettingsOpen: boolean
  isArtefactChoiceOpen: boolean
  /** The slice screen drawn (ticket 211); null while none is. */
  openScreenId: string | null
}

type ReactionRule = (situation: InputSituation) => InputReaction

const NONE: InputReaction = { kind: 'none' }

const MENU_REACTIONS: Readonly<Partial<Record<ActionId, ReactionRule>>> = {
  ui_up: () => ({ kind: 'moveFocus', step: -1 }),
  ui_left: () => ({ kind: 'moveFocus', step: -1 }),
  ui_down: () => ({ kind: 'moveFocus', step: 1 }),
  ui_right: () => ({ kind: 'moveFocus', step: 1 }),
  ui_confirm: () => ({ kind: 'activateFocused' }),
}

const REACTIONS_BY_LAYER: Readonly<
  Record<InputContext, Readonly<Partial<Record<ActionId, ReactionRule>>>>
> = {
  vehicle: {
    interact: interactReaction,
    request_rescue: ({ vehicleMode }) =>
      isWaitingForTow(vehicleMode) ? submit(requestRescueCommand()) : NONE,
    toggle_guns: ({ gunMode }) =>
      gunMode === null ? NONE : submit(setGunModeCommand(toggledGunMode(gunMode))),
    plant_charge: ({ plantableChargeSize }) =>
      plantableChargeSize === null ? NONE : submit(plantChargeCommand(plantableChargeSize)),
    next_charge_size: ({ nextChargeSize }) =>
      nextChargeSize === null ? NONE : { kind: 'chooseChargeSize', size: nextChargeSize },
    open_settings: () => ({ kind: 'openSettings' }),
    zoom_in: () => ({ kind: 'zoom', change: 'in' }),
    zoom_out: () => ({ kind: 'zoom', change: 'out' }),
    zoom_reset: () => ({ kind: 'zoom', change: 'reset' }),
  },
  platform: {
    ...MENU_REACTIONS,
    quick_service: ({ dockedBay }) => (isShopBay(dockedBay) ? submit(quickServiceCommand()) : NONE),
    ui_cancel: () => submit(undockCommand()),
  },
  artefact: {
    ...MENU_REACTIONS,
    ui_cancel: () => ({ kind: 'closeArtefactChoice' }),
  },
  settings: {
    ...MENU_REACTIONS,
    ui_cancel: () => ({ kind: 'closeSettings' }),
  },
  screen: {
    ui_cancel: () => ({ kind: 'dismissScreen' }),
  },
}

export function reactionToPress(action: ActionId, situation: InputSituation): InputReaction {
  const kernelRule = REACTIONS_BY_LAYER[situation.layer][action]
  return kernelRule === undefined ? sliceReactionToPress(action, situation) : kernelRule(situation)
}

/** The layer input goes to: settings, the cache's cards, a slice screen, else the dock screen. */
export function topLayerOf(vehicleMode: VehicleMode, overlays: OpenOverlays): InputContext {
  if (overlays.isSettingsOpen) return 'settings'
  if (overlays.isArtefactChoiceOpen) return 'artefact'
  if (overlays.openScreenId !== null) return 'screen'
  return vehicleMode === 'docked' ? 'platform' : 'vehicle'
}

function sliceReactionToPress(action: ActionId, situation: InputSituation): InputReaction {
  const intent = sliceIntentOfPress(action, situation)
  return intent === null ? NONE : submit(intent)
}

/** The cache and the pad are far apart, so at most one of the two applies. */
function interactReaction(situation: InputSituation): InputReaction {
  if (situation.canOpenArtefactCache) return submit(openArtefactCacheCommand())
  return situation.dockableBay === null ? NONE : submit(dockCommand(situation.dockableBay))
}

/** `request_rescue` is live only for a vehicle that cannot move on its own (#7). */
function isWaitingForTow(mode: VehicleMode): boolean {
  return mode === 'stranded' || mode === 'destroyed'
}

function submit(intent: CommandIntent): InputReaction {
  return { kind: 'submit', intent }
}
