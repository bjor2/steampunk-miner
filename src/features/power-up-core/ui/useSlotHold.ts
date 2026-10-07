/**
 * A slot button's press (#217 input lock, G&V on #200): the touch runtime decides tap or hold from
 * the pointer times, so a tap uses the slot at once; this hook only shows the #164 item card once
 * the press has been held `ITEM_CARD_LONG_PRESS_MS`, and hides it on release. A card that carries
 * the item's sibling-link switch (ticket 274) stays open after the release, so the switch can be
 * tapped, until the card or the slot is tapped. UI state only.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ITEM_CARD_LONG_PRESS_MS } from '../../../constants/itemCard'
import { cancelSlotButton, pressSlotButton, releaseSlotButton } from '../../../store/touchRuntime'
import type { SlotButton } from '../systems/slotColumn'

export interface SlotHold {
  isCardShown: boolean
  /** Open after the release: the card takes taps. */
  isCardPinned: boolean
  press(event: PointerEvent): void
  release(event: PointerEvent): void
  cancel(): void
  closeCard(): void
}

/** Hidden; shown while the slot is held; or kept open after the release. */
type CardShowing = 'hidden' | 'held' | 'pinned'

export function useSlotHold(button: SlotButton): SlotHold {
  const [card, setCard] = useState<CardShowing>('hidden')
  const timer = useRef<number | null>(null)
  useEffect(() => () => stopTimer(timer), [])
  const showCardAs = (next: (now: CardShowing) => CardShowing) => {
    stopTimer(timer)
    setCard(next)
  }
  const isPinnable = button.link !== null
  return {
    isCardShown: card !== 'hidden',
    isCardPinned: card === 'pinned',
    press: (event) => {
      showCardAs(() => 'hidden')
      pressSlotButton(button.action, event.timeStamp)
      showCardAfterHold(timer, () => setCard('held'))
    },
    release: (event) => {
      showCardAs((now) => (now === 'held' && isPinnable ? 'pinned' : 'hidden'))
      releaseSlotButton(button.action, event.timeStamp)
    },
    cancel: () => {
      showCardAs(keepPinnedCard)
      cancelSlotButton(button.action)
    },
    closeCard: () => showCardAs(() => 'hidden'),
  }
}

/** The pointer leaving after a release must not close a pinned card. */
function keepPinnedCard(now: CardShowing): CardShowing {
  return now === 'pinned' ? 'pinned' : 'hidden'
}

function showCardAfterHold(timer: { current: number | null }, show: () => void): void {
  stopTimer(timer)
  timer.current = window.setTimeout(show, ITEM_CARD_LONG_PRESS_MS)
}

function stopTimer(timer: { current: number | null }): void {
  if (timer.current !== null) window.clearTimeout(timer.current)
  timer.current = null
}
