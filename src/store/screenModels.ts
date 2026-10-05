/**
 * The three screens as their view models, read from the authority replica and the store's
 * presentation state (#33): the HUD, the platform screen and the settings overlay. The debug
 * API's `ui.getHudModel()`/`ui.getPlatformModel()` and the DOM components read the same functions,
 * so what a spec asserts is what the screen draws. Read on demand, never stored per tick.
 */
import type { ActionId, Bindings, InputContext } from '../systems/input/actionMap'
import type { Preferences } from '../systems/input/preferences'
import { selectHudModel, type HudModel } from '../systems/views/hudModel'
import type { FocusStop } from '../systems/views/menuFocus'
import {
  PLATFORM_START_FOCUS,
  selectPlatformModel,
  type PlatformModel,
} from '../systems/views/platformModel'
import {
  SETTINGS_START_FOCUS,
  selectSettingsModel,
  type SettingsModel,
} from '../systems/views/settingsModel'
import type { ScreenButton } from '../systems/views/viewParts'
import { readAuthorityState } from './authorityLink'

/** What the screens read from the store besides the authority. */
export interface ScreenSources {
  playerId: string
  depthTiles: number
  prefs: Preferences
  bindings: Bindings
  bindingProblems: readonly string[]
  rebindingActionId: ActionId | null
  isTravelArmed: boolean
}

export interface MenuScreen {
  focusStops: FocusStop[]
  startFocus: string
  buttons: ScreenButton[]
}

export function hudModelOf(sources: ScreenSources): HudModel {
  return selectHudModel({
    state: readAuthorityState(),
    playerId: sources.playerId,
    depthTiles: sources.depthTiles,
    bindings: sources.bindings,
  })
}

export function platformModelOf(sources: ScreenSources): PlatformModel {
  return selectPlatformModel(readAuthorityState(), sources.playerId, {
    isTravelArmed: sources.isTravelArmed,
  })
}

export function settingsModelOf(sources: ScreenSources): SettingsModel {
  return selectSettingsModel(sources)
}

/** The focusable buttons of a menu layer; the vehicle layer has none. */
export function menuScreenOf(layer: InputContext, sources: ScreenSources): MenuScreen {
  if (layer === 'platform') return platformMenu(platformModelOf(sources))
  if (layer === 'settings') return settingsMenu(settingsModelOf(sources))
  return { focusStops: [], startFocus: '', buttons: [] }
}

function platformMenu(model: PlatformModel): MenuScreen {
  const { shop, workshop, charging, footer } = model
  return {
    focusStops: model.focusStops,
    startFocus: PLATFORM_START_FOCUS,
    buttons: [
      ...shop.rows.map((row) => row.sell),
      shop.sellAll,
      ...workshop.upgrades.map((row) => row.buy),
      workshop.repair,
      charging.recharge,
      footer.quickService,
      ...(footer.travel === null ? [] : [footer.travel.button]),
      footer.undock,
      footer.settings,
    ],
  }
}

function settingsMenu(model: SettingsModel): MenuScreen {
  return {
    focusStops: model.focusStops,
    startFocus: SETTINGS_START_FOCUS,
    buttons: [
      ...model.toggles.map((toggle) => toggle.button),
      ...model.bindings.map((row) => row.button),
      model.reset,
      model.close,
    ],
  }
}
