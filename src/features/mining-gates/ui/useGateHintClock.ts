import { useEffect } from 'react'
import { readAuthorityTick } from '../../../store/gameStore'
import { useGateHintStore } from '../store/gateHintStore'

/**
 * Ten times a second while the chip shows, the board ages to the authority's tick, so the chip
 * clears with no input and no new event. Not per frame: its fade-in is a CSS animation.
 */
const GATE_HINT_CLOCK_MS = 100

export function useGateHintClock(isShowing: boolean): void {
  useEffect(() => {
    if (!isShowing) return
    const timer = window.setInterval(showAtAuthorityTick, GATE_HINT_CLOCK_MS)
    return () => window.clearInterval(timer)
  }, [isShowing])
}

function showAtAuthorityTick(): void {
  useGateHintStore.getState().showAt(readAuthorityTick())
}
