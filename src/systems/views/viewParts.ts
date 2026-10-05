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

export interface ScreenButton {
  id: string
  label: string
  action: ButtonAction
  /** The authority's refusal reason now; null when the command would be accepted. */
  reason: RejectionReason | null
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
