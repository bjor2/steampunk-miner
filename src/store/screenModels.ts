/**
 * The screens as their view models, read from the authority replica and the store's presentation
 * state (#33, #37): the HUD, the Sell, Upgrade and Refinery bay screens (#105), the settings overlay and the
 * artefact cache's cards (#46) and the title menu (ticket 403). The debug API's `ui.get*Model()` reads and the DOM components read
 * the same functions, so what a spec asserts is what the screen draws. Read on demand, never
 * stored per tick.
 */
import type { UpgradeId } from '../systems/economy/economyDefinition'
import type { ActionId, Bindings, InputContext } from '../systems/input/actionMap'
import type { Preferences } from '../systems/input/preferences'
import { selectHudModel, type HudModel } from '../systems/views/hudModel'
import type { HintBoard } from '../systems/hints/hintBoard'
import type { TransmissionBoard } from '../systems/hints/transmissionBoard'
import type { FocusStop } from '../systems/views/menuFocus'
import {
  isQuickServiceHighlighted,
  selectPlaqueModel,
  type PlaqueModel,
  type PlaqueSources,
} from '../systems/views/plaqueModel'
import { dockedBayOf } from '../systems/authority/dockRules'
import type { BayUiState } from '../systems/views/bayFrame'
import {
  SELL_BAY_START_FOCUS,
  selectSellBayModel,
  type SellBayModel,
} from '../systems/views/sellBayModel'
import {
  selectUpgradeBayModel,
  upgradeBayStartFocus,
  type UpgradeBayModel,
} from '../systems/views/upgradeBayModel'
import {
  refineryBayStartFocus,
  selectRefineryBayModel,
  type RefineryBayModel,
} from '../systems/views/refineryBayModel'
import {
  SETTINGS_START_FOCUS,
  selectSettingsModel,
  type SettingsModel,
} from '../systems/views/settingsModel'
import type { ScreenButton } from '../systems/views/viewParts'
import {
  pauseMenuButtonsOf,
  selectPauseMenuModel,
  type PauseMenuModel,
  type PauseMenuState,
} from '../systems/views/pauseMenuModel'
import {
  ARTEFACT_CHOICE_START_FOCUS,
  selectArtefactChoiceModel,
  type ArtefactChoiceModel,
} from '../systems/views/artefactChoiceModel'
import {
  selectTitleMenuModel,
  type TitleMenu,
  type TitleMenuModel,
} from '../systems/views/titleMenuModel'
import { readAuthorityState } from './authorityLink'
import type { LiveStepHold } from './liveStepSlice'

/** What the screens read from the store besides the authority. */
export interface ScreenSources {
  playerId: string
  depthTiles: number
  prefs: Preferences
  bindings: Bindings
  padBindings: Bindings
  bindingProblems: readonly string[]
  rebindingActionId: ActionId | null
  isTravelArmed: boolean
  focusedControlId: string | null
  liveStepHold: LiveStepHold
  installingUpgradeId: UpgradeId | null
  hintBoard: HintBoard
  transmissionBoard: TransmissionBoard
  arePlaquesAllowed: boolean
  pauseMenu: PauseMenuState | null
  titleMenu: TitleMenu | null
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
    isAwaitingPlay: sources.liveStepHold === 'awaitingPlay',
  })
}

/** The screen of the bay the vehicle is docked at; null while it is not docked (#37). */
export type BayScreen =
  | { bay: 'sell'; model: SellBayModel }
  | { bay: 'upgrade'; model: UpgradeBayModel }
  | { bay: 'refinery'; model: RefineryBayModel }
  | null

export function bayScreenOf(sources: ScreenSources): BayScreen {
  const bay = dockedBayOf(readAuthorityState(), sources.playerId)
  if (bay === 'sell') return { bay, model: sellBayModelOf(sources) }
  if (bay === 'upgrade') return { bay, model: upgradeBayModelOf(sources) }
  if (bay === 'refinery') return { bay, model: refineryBayModelOf(sources) }
  return null
}

export function sellBayModelOf(sources: ScreenSources): SellBayModel {
  return selectSellBayModel(readAuthorityState(), sources.playerId, bayUiStateOf(sources))
}

export function upgradeBayModelOf(sources: ScreenSources): UpgradeBayModel {
  return selectUpgradeBayModel(readAuthorityState(), sources.playerId, bayUiStateOf(sources))
}

export function refineryBayModelOf(sources: ScreenSources): RefineryBayModel {
  return selectRefineryBayModel(readAuthorityState(), sources.playerId, bayUiStateOf(sources))
}

function bayUiStateOf(sources: ScreenSources): BayUiState {
  return {
    isTravelArmed: sources.isTravelArmed,
    isQuickServiceHighlighted: isQuickServiceHighlighted(plaqueSourcesOf(sources)),
    focusedId: sources.focusedControlId,
    installingUpgradeId: sources.installingUpgradeId,
  }
}

export function plaqueModelOf(sources: ScreenSources): PlaqueModel {
  return selectPlaqueModel(plaqueSourcesOf(sources))
}

/** Hints need both the "Show hints" setting and the scenario's leave; transmissions the latter. */
function plaqueSourcesOf(sources: ScreenSources): PlaqueSources {
  return {
    hintBoard: sources.hintBoard,
    transmissionBoard: sources.transmissionBoard,
    bindings: sources.bindings,
    isShowingHints: sources.prefs.hintsEnabled && sources.arePlaquesAllowed,
    isShowingTransmissions: sources.arePlaquesAllowed,
  }
}

export function settingsModelOf(sources: ScreenSources): SettingsModel {
  return selectSettingsModel(sources)
}

/** The pause menu as it draws now (ticket 404); null while it is closed. */
export function pauseMenuModelOf(sources: ScreenSources): PauseMenuModel | null {
  return sources.pauseMenu === null ? null : selectPauseMenuModel(sources.pauseMenu)
}

export function artefactChoiceModelOf(sources: ScreenSources): ArtefactChoiceModel {
  return selectArtefactChoiceModel(readAuthorityState(), sources.playerId)
}

/** The title menu as it draws now; null once play started. */
export function titleMenuModelOf(sources: ScreenSources): TitleMenuModel | null {
  if (sources.titleMenu === null) return null
  return selectTitleMenuModel({ titleMenu: sources.titleMenu, utcOffsetMinutesAt })
}

/** The zone's offset at that wall time, so a save from before a clock change reads as it was. */
function utcOffsetMinutesAt(savedAtMs: number): number {
  return -new Date(savedAtMs).getTimezoneOffset()
}

/** The focusable buttons of a menu layer; the vehicle layer has none. */
export function menuScreenOf(layer: InputContext, sources: ScreenSources): MenuScreen {
  if (layer === 'title') return titleMenu(titleMenuModelOf(sources))
  if (layer === 'platform') return bayMenu(bayScreenOf(sources))
  if (layer === 'settings') return settingsMenu(settingsModelOf(sources))
  if (layer === 'pause') return pauseMenu(pauseMenuModelOf(sources))
  if (layer === 'artefact') return artefactMenu(artefactChoiceModelOf(sources))
  return NO_MENU
}

const NO_MENU: MenuScreen = { focusStops: [], startFocus: '', buttons: [] }

function bayMenu(screen: BayScreen): MenuScreen {
  if (screen === null) return NO_MENU
  const { focusStops, buttons } = screen.model
  return { focusStops, startFocus: bayStartFocus(screen), buttons }
}

function bayStartFocus(screen: NonNullable<BayScreen>): string {
  if (screen.bay === 'sell') return SELL_BAY_START_FOCUS
  if (screen.bay === 'upgrade') return upgradeBayStartFocus(screen.model)
  return refineryBayStartFocus(screen.model)
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

function pauseMenu(model: PauseMenuModel | null): MenuScreen {
  if (model === null) return NO_MENU
  const { focusStops, startFocus } = model
  return { focusStops, startFocus, buttons: pauseMenuButtonsOf(model) }
}

function titleMenu(model: TitleMenuModel | null): MenuScreen {
  if (model === null) return NO_MENU
  const { focusStops, startFocus, buttons } = model
  return { focusStops, startFocus, buttons }
}

function artefactMenu(model: ArtefactChoiceModel): MenuScreen {
  return {
    focusStops: model.focusStops,
    startFocus: ARTEFACT_CHOICE_START_FOCUS,
    buttons: [...model.cards.map((card) => card.choose), model.leave],
  }
}
