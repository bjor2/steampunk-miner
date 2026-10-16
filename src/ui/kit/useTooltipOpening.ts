/**
 * The open state of a brass tooltip (spec #422 ruling 4, build #423): the pure opening rule in
 * `systems/views/tooltipOpening.ts` answers from the clock, and this hook keeps its state in a
 * ref, sets one timer for the next pending opening, ticks the haptics when a hold opens it and
 * swallows the click that ends that hold. A finger's tap on the element's own text, not on a
 * control in it, calls `onTapOnText`: the owner pins the plate open (ticket 476). UI state only,
 * never a command.
 */
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { TOOLTIP_HAPTIC_MS } from '../../constants/uiParts'
import {
  doesPressEndSwallowClick,
  isTooltipOpenAt,
  TOOLTIP_CLOSED,
  tooltipOpensAtMs,
  withFocus,
  withHoverSince,
  withoutFocus,
  withoutHover,
  withoutPress,
  withPressSince,
  type TooltipOpening,
  type TooltipPointer,
} from '../../systems/views/tooltipOpening'
import { tickHapticsOnHold } from './holdHaptics'
import { isTapOnOwnText, tapPointerOf } from './tapTarget'

export interface TooltipHandlers {
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

interface Timer {
  current: number | null
}

export function useTooltipOpening(onTapOnText: () => void): {
  isOpen: boolean
  handlers: TooltipHandlers
} {
  const [isOpen, setIsOpen] = useState(false)
  const lastPointer = useRef<TooltipPointer | null>(null)
  const opening = useRef<TooltipOpening>(TOOLTIP_CLOSED)
  const wasOpen = useRef(false)
  const timer = useRef<number | null>(null)
  const swallowsClick = useRef(false)
  useEffect(() => () => stopTimer(timer), [])
  const refresh = () => {
    const nowMs = performance.now()
    const open = isTooltipOpenAt(opening.current, nowMs)
    tickWhenHoldOpens(opening.current, open, wasOpen)
    wasOpen.current = open
    setIsOpen(open)
    scheduleOpening(timer, tooltipOpensAtMs(opening.current, nowMs), nowMs, refresh)
  }
  const settle = (next: TooltipOpening) => {
    opening.current = next
    refresh()
  }
  const endPress = () => {
    swallowsClick.current = doesPressEndSwallowClick(opening.current, performance.now())
    settle(withoutPress(opening.current))
  }
  return {
    isOpen,
    handlers: {
      onPointerEnter: (event) => {
        if (event.pointerType === 'mouse')
          settle(withHoverSince(opening.current, performance.now()))
      },
      onPointerLeave: () => settle(withoutHover(opening.current)),
      onPointerDown: (event) => {
        lastPointer.current = tapPointerOf(event.pointerType)
        settle(withPressSince(opening.current, lastPointer.current, performance.now()))
      },
      onPointerUp: endPress,
      onPointerCancel: endPress,
      onFocus: () => settle(withFocus(opening.current)),
      onBlur: () => settle(withoutFocus(opening.current)),
      onClickCapture: (event) => swallowClickAfterHold(event, swallowsClick),
      onClick: (event) => callOnTapOnText(event, lastPointer, onTapOnText),
    },
  }
}

/** The pointer is read once per click, so a later key press never counts as a tap. */
function callOnTapOnText(
  event: MouseEvent,
  lastPointer: { current: TooltipPointer | null },
  onTapOnText: () => void,
): void {
  if (isTapOnOwnText(event, lastPointer.current)) onTapOnText()
  lastPointer.current = null
}

/** One timer for the next pending opening; none while nothing is pending. */
function scheduleOpening(
  timer: Timer,
  opensAtMs: number | null,
  nowMs: number,
  refresh: () => void,
): void {
  stopTimer(timer)
  if (opensAtMs === null) return
  timer.current = window.setTimeout(refresh, Math.max(0, opensAtMs - nowMs))
}

function stopTimer(timer: Timer): void {
  if (timer.current !== null) window.clearTimeout(timer.current)
  timer.current = null
}

/** The moment a held touch opens the tooltip is the one the player feels. */
function tickWhenHoldOpens(
  opening: TooltipOpening,
  isOpen: boolean,
  wasOpen: { current: boolean },
): void {
  if (isOpen && !wasOpen.current && opening.pressSinceMs !== null)
    tickHapticsOnHold(TOOLTIP_HAPTIC_MS)
}

/** The click that ends a long press only closed the tooltip: the control under it does not act. */
function swallowClickAfterHold(event: MouseEvent, swallowsClick: { current: boolean }): void {
  if (!swallowsClick.current) return
  swallowsClick.current = false
  event.stopPropagation()
  event.preventDefault()
}
