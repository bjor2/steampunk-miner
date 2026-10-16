/**
 * Parts every screen model shares (#33 sections 6 and 8): an amount as screen text plus its exact
 * canonical string for `data-exact`, and a button that carries the command it submits with the
 * reason the authority would refuse it now, so a disabled button says exactly what `submit` would.
 */
import type { AuthorityState } from '../authority/authorityState'
import type { CommandIntent } from '../authority/authorityCommand'
import { refusalOfIntent } from '../authority/applyCommand'
import type { RejectionReason } from '../authority/domainEvent'
import { exactAmount, formatAmount } from '../displayAmount'
import type { ActionId } from '../input/actionMap'
import type { PreferenceName } from '../input/preferences'
import { floorMilli, fromCanonical, type Money } from '../money'
import type { SaveSlotKey } from '../save/saveSlotIndex'
import type { TitleMenuPage } from './titleMenuModel'

export interface AmountReading {
  text: string
  exact: string
}

/** What activating a button does: one authority command, or a UI step that changes no state. */
export type ButtonAction =
  | { kind: 'submit'; intent: CommandIntent }
  | { kind: 'armTravel' }
  | { kind: 'openSettings' }
  | { kind: 'closeSettings' }
  | { kind: 'closeArtefactChoice' }
  | { kind: 'togglePreference'; name: PreferenceName }
  | { kind: 'rebind'; actionId: ActionId }
  | { kind: 'resetBindings' }
  /** Settings' save file (ticket 479): the session's last save out, or a picked file in. */
  | { kind: 'exportSave' }
  | { kind: 'importSave' }
  /** The pause menu (ticket 404): Resume, its save page, a slot's save or overwrite's first press. */
  | { kind: 'closePauseMenu' }
  | { kind: 'openSaveSlots' }
  | { kind: 'closeSaveSlots' }
  | { kind: 'saveToSlot'; slot: SaveSlotKey }
  | { kind: 'armOverwrite'; slot: SaveSlotKey }
  // The title menu (ticket 403): New Game (asking first when a save exists), its confirm,
  // Continue, one slot's Load, and a page change.
  | { kind: 'pressNewGame' }
  | { kind: 'confirmNewGame' }
  | { kind: 'continueGame' }
  | { kind: 'loadSlot'; slot: SaveSlotKey }
  | { kind: 'showTitlePage'; page: TitleMenuPage }

/**
 * Why a button is disabled: the authority's refusal of its command, or a menu's own (`no_save`:
 * the title menu's Continue and Load with no slot to read, ticket 403).
 */
export type ButtonRefusal = RejectionReason | 'no_save'

export interface ScreenButton {
  id: string
  label: string
  action: ButtonAction
  /** The authority's refusal reason now, or a menu's own; null when the press would be accepted. */
  reason: ButtonRefusal | null
  /** A glyph of the icon set beside the label (#158); absent on a plain text button. */
  iconId?: string
}

export function withIcon(button: ScreenButton, iconId: string): ScreenButton {
  return { ...button, iconId }
}

export function amountReading(amount: Money | number): AmountReading {
  return { text: formatAmount(amount), exact: exactAmount(amount) }
}

/**
 * A canonical stat for display: kept to the 3 decimals the formatter shows below 1,000, cut
 * toward zero like the formatter; the exact string stays beside it.
 */
export function statReading(canonical: string): AmountReading {
  return { text: formatAmount(floorMilli(fromCanonical(canonical))), exact: canonical }
}

export function commandButton(
  state: AuthorityState,
  playerId: string,
  id: string,
  label: string,
  intent: CommandIntent,
): ScreenButton {
  return {
    id,
    label,
    action: { kind: 'submit', intent },
    reason: refusalOfIntent(state, playerId, intent)?.reason ?? null,
  }
}

export function uiButton(id: string, label: string, action: ButtonAction): ScreenButton {
  return { id, label, action, reason: null }
}
