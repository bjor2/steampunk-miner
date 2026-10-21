/**
 * Tap-to-reveal on the sheet's cards (spec #678, ticket 686; docs/ui/design-system.md section 10):
 * a card is a title plus one line. Where no pointer hovers, a finger's or pen's first tap shows the
 * line and the second tap on the same card acts; a tap on another card moves the reveal there.
 * A mouse has already shown the line by hovering and the keyboard by focusing, so their press acts
 * at once (desktop's hover detail replaces the phone's tap-to-reveal). One card shows its line at a
 * time. Presentation only: the reveal is never a command, a log line or part of the digest.
 */
import type { TooltipPointer } from './tooltipOpening'

/** What pressed the card: a pointer, or Enter or Space on the focused card. */
export type CardPresser = TooltipPointer | 'keyboard'

/** `reveal` shows the card's line and does nothing else; `act` runs the card's action. */
export type CardPress = 'reveal' | 'act'

export function cardPressOf(
  revealedCardId: string | null,
  cardId: string,
  presser: CardPresser,
): CardPress {
  if (!isRevealedByTap(presser)) return 'act'
  return revealedCardId === cardId ? 'act' : 'reveal'
}

/** The card whose line shows after the press: a reveal moves it, an action leaves it. */
export function revealedCardAfter(
  revealedCardId: string | null,
  cardId: string,
  press: CardPress,
): string | null {
  return press === 'reveal' ? cardId : revealedCardId
}

/** Only a finger or a pen needs a first tap to see what hover would show. */
function isRevealedByTap(presser: CardPresser): boolean {
  return presser === 'touch' || presser === 'pen'
}
