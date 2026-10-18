/**
 * A press held for `holdMs` (ticket 549's hidden gesture): `onHold` fires once while the pointer
 * is still down, and the click that ends that press is swallowed so a tap action does not follow.
 * A shorter press is a plain click. Any pointer counts, a finger, a pen or a mouse. UI state only.
 */
import { useEffect, useRef, type MouseEvent } from 'react'

export interface LongPressHandlers {
  onPointerDown(): void
  onPointerUp(): void
  onPointerLeave(): void
  onPointerCancel(): void
  onClickCapture(event: MouseEvent): void
  onContextMenu(event: MouseEvent): void
}

export function useLongPress(onHold: () => void, holdMs: number): LongPressHandlers {
  const timer = useRef<number | null>(null)
  const isHeld = useRef(false)
  useEffect(() => () => stopTimer(timer), [])
  const hold = () => {
    isHeld.current = true
    onHold()
  }
  return {
    onPointerDown: () => {
      stopTimer(timer)
      isHeld.current = false
      timer.current = window.setTimeout(hold, holdMs)
    },
    onPointerUp: () => stopTimer(timer),
    onPointerLeave: () => stopTimer(timer),
    onPointerCancel: () => stopTimer(timer),
    onClickCapture: (event) => swallowClickAfterHold(event, isHeld),
    // A phone's long press would open the page's own menu over the label.
    onContextMenu: (event) => event.preventDefault(),
  }
}

function stopTimer(timer: { current: number | null }): void {
  if (timer.current !== null) window.clearTimeout(timer.current)
  timer.current = null
}

function swallowClickAfterHold(event: MouseEvent, isHeld: { current: boolean }): void {
  if (!isHeld.current) return
  isHeld.current = false
  event.stopPropagation()
  event.preventDefault()
}
