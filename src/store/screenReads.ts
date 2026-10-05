/**
 * The screens' view models now (#33, #37), for the DOM components and the debug API's `ui.*` reads:
 * the same functions on the same store, so a spec reads what the screen draws.
 */
import type { HudModel } from '../systems/views/hudModel'
import type { PlaqueModel } from '../systems/views/plaqueModel'
import type { SellBayModel } from '../systems/views/sellBayModel'
import type { UpgradeBayModel } from '../systems/views/upgradeBayModel'
import type { SettingsModel } from '../systems/views/settingsModel'
import { useGameStore } from './gameStore'
import {
  bayScreenOf,
  hudModelOf,
  plaqueModelOf,
  sellBayModelOf,
  settingsModelOf,
  upgradeBayModelOf,
  type BayScreen,
} from './screenModels'

export function readHudModel(): HudModel {
  return hudModelOf(useGameStore.getState())
}

/** The screen of the bay the vehicle is docked at, or null (#37). */
export function readBayScreen(): BayScreen {
  return bayScreenOf(useGameStore.getState())
}

/** The Sell bay's model, as it would draw now, docked there or not. */
export function readSellBayModel(): SellBayModel {
  return sellBayModelOf(useGameStore.getState())
}

/** The Upgrade bay's model, as it would draw now, docked there or not. */
export function readUpgradeBayModel(): UpgradeBayModel {
  return upgradeBayModelOf(useGameStore.getState())
}

export function readSettingsModel(): SettingsModel {
  return settingsModelOf(useGameStore.getState())
}

/** The hint and transmission plaques (#16) as they are drawn. */
export function readPlaqueModel(): PlaqueModel {
  return plaqueModelOf(useGameStore.getState())
}
