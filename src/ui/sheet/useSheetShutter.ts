/**
 * The base sheet's shutter (spec #678, ticket 686): opening a tab slides the sheet in over the
 * sheet duration, closing slides it out (a fade under Reduce Motion, the shake switch as for the
 * bay shutter of #45), and while it closes the tab it showed stays drawn so the shutter has
 * something to cover. A tab change on an open sheet swaps the content in place.
 */
import { useEffect, useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { sheetTransitionOf, type SheetTransition } from '../../systems/views/sheetLayout'
import type { SheetPhase } from '../kit/Sheet'

export interface SheetShutter {
  /** The tab on screen, kept through the close; null once the shutter is shut. */
  tabId: string | null
  phase: SheetPhase
  transition: SheetTransition
}

type ShutterPhase = SheetPhase | 'closed'

export function useSheetShutter(openTabId: string | null): SheetShutter {
  const isMotionReduced = useGameStore((state) => !state.prefs.shake)
  const transition = sheetTransitionOf(isMotionReduced)
  const [shownTabId, setShownTabId] = useState<string | null>(openTabId)
  const [phase, setPhase] = useState<ShutterPhase>(openTabId === null ? 'closed' : 'opening')
  useEffect(() => {
    if (openTabId !== null) setShownTabId(openTabId)
    setPhase((shown) => phaseOnTabChange(openTabId, shown))
  }, [openTabId])
  useEffect(
    () => settleAfter(phase, transition.ms, setPhase, setShownTabId),
    [phase, transition.ms],
  )
  return { tabId: phase === 'closed' ? null : shownTabId, phase: drawnPhaseOf(phase), transition }
}

/** Opening a tab on an open sheet keeps it open; closing shuts whatever is on screen. */
function phaseOnTabChange(openTabId: string | null, shown: ShutterPhase): ShutterPhase {
  if (openTabId === null) return shown === 'closed' ? 'closed' : 'closing'
  return shown === 'open' ? 'open' : 'opening'
}

/** Ends an opening or a closing once its time has run; returns the call that cancels it. */
function settleAfter(
  phase: ShutterPhase,
  ms: number,
  setPhase: (phase: ShutterPhase) => void,
  setShownTabId: (tabId: string | null) => void,
): (() => void) | undefined {
  if (phase !== 'opening' && phase !== 'closing') return undefined
  const timer = setTimeout(() => {
    if (phase === 'closing') setShownTabId(null)
    setPhase(phase === 'opening' ? 'open' : 'closed')
  }, ms)
  return () => clearTimeout(timer)
}

/** A shut sheet draws nothing, so its phase never reaches the frame. */
function drawnPhaseOf(phase: ShutterPhase): SheetPhase {
  return phase === 'closed' ? 'closing' : phase
}
