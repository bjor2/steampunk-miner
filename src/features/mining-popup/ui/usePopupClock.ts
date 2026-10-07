import { useEffect } from 'react'
import { readAuthorityTick } from '../../../store/gameStore'
import { useMiningPopupStore } from '../store/miningPopupStore'

/**
 * Ten times a second while anything shows, the boards age to the authority's tick, so a chip or
 * plaque fades and clears with no input and no new event (#172 §2: never clicked). Not per frame:
 * the fades themselves are CSS transitions.
 */
const POPUP_CLOCK_MS = 100

export function usePopupClock(isShowing: boolean): void {
  useEffect(() => {
    if (!isShowing) return
    const timer = window.setInterval(showAtAuthorityTick, POPUP_CLOCK_MS)
    return () => window.clearInterval(timer)
  }, [isShowing])
}

function showAtAuthorityTick(): void {
  useMiningPopupStore.getState().showAt(readAuthorityTick())
}
