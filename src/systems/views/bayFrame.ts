/**
 * What both bay screens share (#33 section 6, split into two bays by #37): the header with money,
 * planet, the core bay gauge and the platform state, and the footer with travel (or the
 * end-of-slice card on the last planet), undock and settings. Every button carries the command it
 * submits and the reason the authority would refuse it now.
 *
 * Travel needs a second activation because it spends fragments and cannot be undone; that is UI
 * state, and the authority still sees one `Travel`. It is offered at both bays (#37).
 */
import { SLICE_LAST_PLANET } from '../../constants/balance'
import {
  bayEmblemIdOf,
  buttonIconIdOf,
  gaugeIconIdOf,
  hudLabelIconIdOf,
  panelIconIdOf,
  platformStateIconIdOf,
} from '../art/icons/iconSet'
import type { AuthorityState } from '../authority/authorityState'
import { coreNeededOf } from '../authority/coreBay'
import type { RejectionReason } from '../authority/domainEvent'
import type { PlatformVisualState } from '../authority/platformState'
import { travelRefusal } from '../authority/travelRules'
import { travelFee } from '../economy/planetCharges'
import { travelCommand, undockCommand } from '../platform/platformCommands'
import type { BayId } from '../world/dockBays'
import type { UpgradeId } from '../economy/economyDefinition'
import { BAY_ACCENTS, BAY_NAMES, type BayAccent } from './bayNames'
import type { GaugeReading } from './hudModel'
import type { FocusStop } from './menuFocus'
import { UI_IDS } from './screenIds'
import {
  amountReading,
  commandButton,
  uiButton,
  withIcon,
  type AmountReading,
  type ScreenButton,
} from './viewParts'

/** The UI state a bay screen reads besides the authority: none of it is ever submitted. */
export interface BayUiState {
  isTravelArmed: boolean
  /** While the dock hint is up, its first visit (#16); the Sell bay highlights its quick action. */
  isQuickServiceHighlighted: boolean
  /** The control with menu focus; the Upgrade bay's preview follows it. */
  focusedId: string | null
  /** The track whose part the Upgrade bay preview is installing after a purchase (#44). */
  installingUpgradeId: UpgradeId | null
}

export interface BayHeader {
  bay: BayId
  bayName: string
  /** The bay's accent and motif over the shared chrome (#45): copper scale or teal gear. */
  accent: BayAccent
  /** The bay's emblem of the icon set, its motif in its accent (#45, #158). */
  emblemId: string
  money: AmountReading
  moneyIconId: string
  planet: number
  planetIconId: string
  /** The bay against `coreNeeded` (#8, #33): "17 / 63" and a brass dial. */
  coreBay: GaugeReading
  platformState: PlatformVisualState
  platformStateText: string
  platformStateIconId: string
}

/** `ready`, or the reason the authority refuses `Travel` now (`core_short`, `money_short`, ...). */
export type TravelState = 'ready' | RejectionReason

export interface TravelReading {
  button: ScreenButton
  fee: AmountReading
  fragmentsText: string
  state: TravelState
  isArmed: boolean
}

export interface BayFooter {
  /** Null on the slice's last planet, where the end-of-slice card stands instead. */
  travel: TravelReading | null
  hasEndCard: boolean
  undock: ScreenButton
  settings: ScreenButton
}

const PLATFORM_STATE_TEXT: Readonly<Record<PlatformVisualState, string>> = {
  outpost: 'Outpost',
  core_drive: 'Core drive',
}

export function bayHeaderOf(state: AuthorityState, playerId: string, bay: BayId): BayHeader {
  const needed = coreNeededOf(state.planet) ?? 0
  return {
    bay,
    bayName: BAY_NAMES[bay],
    accent: BAY_ACCENTS[bay],
    emblemId: bayEmblemIdOf(bay),
    money: amountReading(state.players[playerId].wallet),
    moneyIconId: hudLabelIconIdOf('money'),
    planet: state.planet.index,
    planetIconId: hudLabelIconIdOf('planet'),
    coreBay: coreBayGaugeOf(state.platform.coreBay, needed),
    platformState: state.platform.visualState,
    platformStateText: PLATFORM_STATE_TEXT[state.platform.visualState],
    platformStateIconId: platformStateIconIdOf(state.platform.visualState),
  }
}

export function bayFooterOf(state: AuthorityState, playerId: string, ui: BayUiState): BayFooter {
  const hasEndCard = state.planet.index >= SLICE_LAST_PLANET
  return {
    travel: hasEndCard ? null : travelReadingOf(state, playerId, ui.isTravelArmed),
    hasEndCard,
    undock: withIcon(
      commandButton(state, playerId, UI_IDS.platformUndock, 'Undock', undockCommand()),
      buttonIconIdOf('undock'),
    ),
    settings: withIcon(
      uiButton(UI_IDS.platformSettings, 'Settings', { kind: 'openSettings' }),
      panelIconIdOf('settings'),
    ),
  }
}

/** The footer's buttons in reading order. */
export function footerButtonsOf(footer: BayFooter): ScreenButton[] {
  const travel = footer.travel === null ? [] : [footer.travel.button]
  return [...travel, footer.undock, footer.settings]
}

export function stopIn(panel: string): (button: ScreenButton) => FocusStop {
  return (button) => ({ id: button.id, panel })
}

function coreBayGaugeOf(coreBay: number, needed: number): GaugeReading {
  const permille = needed > 0 ? Math.min(Math.floor((coreBay * 1000) / needed), 1000) : 0
  return {
    text: `${coreBay} / ${needed}`,
    exact: String(coreBay),
    permille,
    iconId: gaugeIconIdOf('core_bay'),
  }
}

/** The first activation arms the confirmation; only an armed button submits `Travel`. */
function travelReadingOf(state: AuthorityState, playerId: string, isArmed: boolean): TravelReading {
  const toPlanet = state.planet.index + 1
  const reason = travelRefusal(state, playerId, toPlanet)?.reason ?? null
  return {
    button: {
      id: UI_IDS.platformTravel,
      label: isArmed ? `Confirm travel to planet ${toPlanet}` : `Travel to planet ${toPlanet}`,
      action: isArmed ? { kind: 'submit', intent: travelCommand(toPlanet) } : { kind: 'armTravel' },
      reason,
      iconId: buttonIconIdOf('travel'),
    },
    fee: amountReading(travelFee(state.planet.index)),
    fragmentsText: `${state.platform.coreBay} / ${coreNeededOf(state.planet) ?? 0}`,
    state: reason ?? 'ready',
    isArmed,
  }
}
