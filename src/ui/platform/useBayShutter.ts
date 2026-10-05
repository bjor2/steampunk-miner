/**
 * The bay screen's shutter (#45): docking slides the screen in over 0.25 s, undocking slides it
 * back out (a fade with reduce motion), and the camera never cuts. While it closes, the bay it
 * showed stays on screen, so the shutter has something to cover.
 */
import { useEffect, useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { bayTransitionOf, type BayTransition } from '../../systems/views/bayPresentation'
import type { BayId } from '../../systems/world/dockBays'
import { bayScreenPresence, type BayScreenPhase } from './bayScreenPresence'

export interface BayShutter {
  /** The bay on screen, kept through the close; null once the shutter is shut. */
  bay: BayId | null
  phase: BayScreenPhase
  transition: BayTransition
}

export function useBayShutter(dockedBay: BayId | null): BayShutter {
  const isMotionReduced = useGameStore((state) => !state.prefs.shake)
  const transition = bayTransitionOf(isMotionReduced)
  const [shownBay, setShownBay] = useState<BayId | null>(dockedBay)
  const [phase, setPhase] = useState<BayScreenPhase>(dockedBay === null ? 'closed' : 'opening')
  useEffect(() => {
    if (dockedBay !== null) setShownBay(dockedBay)
    setPhase((shown) => phaseOnDockChange(dockedBay, shown))
  }, [dockedBay])
  useEffect(
    () => settleAfter(phase, transition.seconds, setPhase, setShownBay),
    [phase, transition.seconds],
  )
  useEffect(() => reportShutter(shownBay, phase, transition))
  return { bay: shownBay, phase, transition }
}

/** Docking opens; undocking closes whatever is on screen, and nothing is to close when shut. */
function phaseOnDockChange(dockedBay: BayId | null, shown: BayScreenPhase): BayScreenPhase {
  if (dockedBay !== null) return 'opening'
  return shown === 'closed' ? 'closed' : 'closing'
}

/** Ends an opening or a closing once its time has run; returns the call that cancels it. */
function settleAfter(
  phase: BayScreenPhase,
  seconds: number,
  setPhase: (phase: BayScreenPhase) => void,
  setShownBay: (bay: BayId | null) => void,
): (() => void) | undefined {
  if (phase !== 'opening' && phase !== 'closing') return undefined
  const timer = setTimeout(() => {
    if (phase === 'closing') setShownBay(null)
    setPhase(phase === 'opening' ? 'open' : 'closed')
  }, seconds * 1000)
  return () => clearTimeout(timer)
}

function reportShutter(bay: BayId | null, phase: BayScreenPhase, transition: BayTransition): void {
  bayScreenPresence.bay = bay
  bayScreenPresence.phase = phase
  bayScreenPresence.transition = phase === 'closed' ? null : transition
}
