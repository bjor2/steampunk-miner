/**
 * What both bay screens share (#33 section 6, split into two bays by #37): the header with money,
 * planet, the core bay gauge and the platform state, and the footer with the star map, undock and
 * settings. Every button carries the command it submits and the reason the authority would refuse
 * it now.
 *
 * The footer's way off the planet is the star map (ticket 793): its Star map opens the map, where
 * every planet's Jump and the fuel it needs are (`starMapControls.ts`). It replaced the slice's
 * fragment-spending Travel and its end-of-slice card, which the #650 star map had outdated; the
 * host's `Travel` rule stays, so old replays still replay.
 */
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
import type { PlatformVisualState } from '../authority/platformState'
import { actionDefOf, ACTION_MAP } from '../input/actionMap'
import { undockCommand } from '../platform/platformCommands'
import type { BayId } from '../world/dockBays'
import type { UpgradeId } from '../economy/economyDefinition'
import type { TripLedger } from './tripIncome'
import { BAY_ACCENTS, BAY_NAMES, type BayAccent } from './bayNames'
import { planetGravityTraitOf, type LocalGravityReading } from './localGravityReading'
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
  /** While the dock hint is up, its first visit (#16); the Sell bay highlights its quick action. */
  isQuickServiceHighlighted: boolean
  /** The control with menu focus; the Upgrade bay's preview follows it. */
  focusedId: string | null
  /** The track whose part the Upgrade bay preview is installing after a purchase (#44). */
  installingUpgradeId: UpgradeId | null
  /**
   * The local player's last trips' income, which the Outfitter's "{N} trips away" reads (ticket
   * 719); absent where no trip was followed, which reads as no trip done.
   */
  tripLedger?: TripLedger
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
  /** The planet's gravity as its trait, "1.25 g" (#724, the planet-row registry). */
  planetGravity: LocalGravityReading
  /** The bay against `coreNeeded` (#8, #33): "17 / 63" and a brass dial. */
  coreBay: GaugeReading
  platformState: PlatformVisualState
  platformStateText: string
  platformStateIconId: string
}

export interface BayFooter {
  /** Opens the star map (ticket 793), where the jumps to the other planets are. */
  starMap: ScreenButton
  undock: ScreenButton
  settings: ScreenButton
}

/** The footer's Star map is named as the key that opens the map is. */
const STAR_MAP_LABEL = actionDefOf(ACTION_MAP, 'open_star_map').displayName

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
    planetGravity: planetGravityTraitOf(state.planet.index),
    coreBay: coreBayGaugeOf(state.platform.coreBay, needed),
    platformState: state.platform.visualState,
    platformStateText: PLATFORM_STATE_TEXT[state.platform.visualState],
    platformStateIconId: platformStateIconIdOf(state.platform.visualState),
  }
}

export function bayFooterOf(state: AuthorityState, playerId: string): BayFooter {
  return {
    starMap: withIcon(
      uiButton(UI_IDS.platformStarMap, STAR_MAP_LABEL, { kind: 'toggleStarMap' }),
      hudLabelIconIdOf('compass'),
    ),
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
  return [footer.starMap, footer.undock, footer.settings]
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
