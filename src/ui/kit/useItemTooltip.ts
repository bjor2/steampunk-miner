/**
 * The open state of an item card tooltip (#164 G&V input rules, K7 #199): a mouse hover or the
 * browser's focus opens it after `ITEM_CARD_HOVER_MS`; a touch held for `ITEM_CARD_LONG_PRESS_MS`
 * opens it while held, with a short haptic tick when the haptics setting is on (#173), and the
 * click that ends that press is swallowed so no action fires. A finger's tap on the anchor's own
 * text, not on its control, calls `onTapOnText`: the owner pins the card open (ticket 476). UI
 * state only, never a command.
 */
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import {
  ITEM_CARD_HAPTIC_MS,
  ITEM_CARD_HOVER_MS,
  ITEM_CARD_LONG_PRESS_MS,
} from '../../constants/itemCard'
import { tickHapticsOnHold } from './holdHaptics'
import { isTapOnOwnText, tapPointerOf } from './tapTarget'

export interface ItemTooltipHandlers {
  onPointerEnter(event: PointerEvent): void
  onPointerLeave(event: PointerEvent): void
  onPointerDown(event: PointerEvent): void
  onPointerUp(event: PointerEvent): void
  onPointerCancel(event: PointerEvent): void
  onFocus(event: FocusEvent): void
  onBlur(event: FocusEvent): void
  onClickCapture(event: MouseEvent): void
  onClick(event: MouseEvent): void
}

export function useItemTooltip(onTapOnText: () => void): {
  isOpen: boolean
  handlers: ItemTooltipHandlers
} {
  const [isOpen, setIsOpen] = useState(false)
  const timer = useRef<number | null>(null)
  const isTouchPress = useRef(false)
  const isHeldOpen = useRef(false)
  useEffect(() => () => stopTimer(timer), [])
  const openAfter = (ms: number) => {
    stopTimer(timer)
    timer.current = window.setTimeout(() => setIsOpen(true), ms)
  }
  const close = () => {
    stopTimer(timer)
    setIsOpen(false)
  }
  const holdOpen = () => {
    isHeldOpen.current = true
    setIsOpen(true)
    tickHapticsOnHold(ITEM_CARD_HAPTIC_MS)
  }
  return {
    isOpen,
    handlers: {
      onPointerEnter: (event) => {
        if (event.pointerType === 'mouse') openAfter(ITEM_CARD_HOVER_MS)
      },
      onPointerLeave: close,
      onPointerDown: (event) => {
        isTouchPress.current = tapPointerOf(event.pointerType) !== 'mouse'
        if (!isTouchPress.current) return
        stopTimer(timer)
        timer.current = window.setTimeout(holdOpen, ITEM_CARD_LONG_PRESS_MS)
      },
      onPointerUp: (event) => {
        if (event.pointerType !== 'mouse') close()
      },
      onPointerCancel: close,
      onFocus: () => openAfter(ITEM_CARD_HOVER_MS),
      onBlur: close,
      onClickCapture: (event) => swallowClickAfterHold(event, isHeldOpen),
      onClick: (event) => callOnTapOnText(event, isTouchPress, onTapOnText),
    },
  }
}

/** The press is read once per click, so a later key press never counts as a tap. */
function callOnTapOnText(
  event: MouseEvent,
  isTouchPress: { current: boolean },
  onTapOnText: () => void,
): void {
  if (isTapOnOwnText(event, isTouchPress.current ? 'touch' : null)) onTapOnText()
  isTouchPress.current = false
}

function stopTimer(timer: { current: number | null }): void {
  if (timer.current !== null) window.clearTimeout(timer.current)
  timer.current = null
}

/** The click that ends a long press only closed the card: the control it covers does not act. */
function swallowClickAfterHold(event: MouseEvent, isHeldOpen: { current: boolean }): void {
  if (!isHeldOpen.current) return
  isHeldOpen.current = false
  event.stopPropagation()
  event.preventDefault()
}
