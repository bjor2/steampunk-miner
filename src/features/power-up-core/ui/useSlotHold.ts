/**
 * A slot button's press (#217 input lock, G&V on #200): the touch runtime decides tap or hold from
 * the pointer times, so a tap uses the slot at once; this hook only shows the #164 item card once
 * the press has been held `ITEM_CARD_LONG_PRESS_MS`, and hides it on release. UI state only.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ITEM_CARD_LONG_PRESS_MS } from '../../../constants/itemCard'
import type { SlotTileActionId } from '../../../systems/input/touchControls'
import { cancelSlotButton, pressSlotButton, releaseSlotButton } from '../../../store/touchRuntime'

export interface SlotHold {
  isCardShown: boolean
  press(event: PointerEvent): void
  release(event: PointerEvent): void
  cancel(): void
}

export function useSlotHold(action: SlotTileActionId): SlotHold {
  const [isCardShown, setIsCardShown] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => stopTimer(timer), [])
  const endHold = () => {
    stopTimer(timer)
    setIsCardShown(false)
  }
  return {
    isCardShown,
    press: (event) => {
      pressSlotButton(action, event.timeStamp)
      showCardAfterHold(timer, () => setIsCardShown(true))
    },
    release: (event) => {
      endHold()
      releaseSlotButton(action, event.timeStamp)
    },
    cancel: () => {
      endHold()
      cancelSlotButton(action)
    },
  }
}

function showCardAfterHold(timer: { current: number | null }, show: () => void): void {
  stopTimer(timer)
  timer.current = window.setTimeout(show, ITEM_CARD_LONG_PRESS_MS)
}

function stopTimer(timer: { current: number | null }): void {
  if (timer.current !== null) window.clearTimeout(timer.current)
  timer.current = null
}
