/**
 * Whether a tap on a touch screen lands on an element's own text (spec #470 section 3, ticket
 * 476): a finger or pen tapped it, not a mouse, which hovers instead, and not on a control or a
 * tappable amount inside or around it, which acts on the tap itself. Such a tap pins the element's
 * tooltip or card open, so nothing that hover shows is out of reach on a phone.
 */
import type { MouseEvent } from 'react'
import type { TooltipPointer } from '../../systems/views/tooltipOpening'

/** What acts on its own tap: a control, or a shortened amount (`AmountText`). */
const TAP_OWNER = 'button, [role="button"], a[href], input, select, textarea, [data-tap-exact]'

export function isTapOnOwnText(event: MouseEvent, pointer: TooltipPointer | null): boolean {
  return pointer !== null && pointer !== 'mouse' && !isTapOwnedByControl(event)
}

export function tapPointerOf(pointerType: string): TooltipPointer {
  return pointerType === 'mouse' ? 'mouse' : pointerType === 'pen' ? 'pen' : 'touch'
}

/** The tap landed on a control or a tappable amount, which acts on it itself. */
export function isTapOwnedByControl(event: MouseEvent): boolean {
  return event.target instanceof Element && event.target.closest(TAP_OWNER) !== null
}
