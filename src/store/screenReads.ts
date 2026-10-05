/**
 * The screens' view models now (#33), for the DOM components and the debug API's `ui.*` reads:
 * the same functions on the same store, so a spec reads what the screen draws.
 */
import type { HudModel } from '../systems/views/hudModel'
import type { PlaqueModel } from '../systems/views/plaqueModel'
import type { PlatformModel } from '../systems/views/platformModel'
import type { SettingsModel } from '../systems/views/settingsModel'
import { useGameStore } from './gameStore'
import { hudModelOf, plaqueModelOf, platformModelOf, settingsModelOf } from './screenModels'

export function readHudModel(): HudModel {
  return hudModelOf(useGameStore.getState())
}

export function readPlatformModel(): PlatformModel {
  return platformModelOf(useGameStore.getState())
}

export function readSettingsModel(): SettingsModel {
  return settingsModelOf(useGameStore.getState())
}

/** The hint and transmission plaques (#16) as they are drawn. */
export function readPlaqueModel(): PlaqueModel {
  return plaqueModelOf(useGameStore.getState())
}
