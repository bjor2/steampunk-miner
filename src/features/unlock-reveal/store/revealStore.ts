/**
 * The unlock reveal's UI state (ticket 718; feature-slices.md 6.4: a slice keeps its UI state in
 * its `store/`): the reveal playing now, started by the local player's first buy of a new
 * capability and ended when its time runs out, on a tap, or when the rig leaves the dock. While it
 * plays a phone's full sheet steps aside so the car shows, and comes back on its tab after; the
 * game store's `stepSheetAside` and `bringSheetBack` are the only writes, and nothing submits.
 */
import { create } from 'zustand'
import { useGameStore } from '../../../store/gameStore'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { isRevealPlayingAt, revealOfBatch, type UnlockReveal } from '../systems/unlockReveal'

interface RevealState {
  reveal: UnlockReveal | null
  /** A `listenForDomainEvents` listener: a new capability bought starts its reveal. */
  hearRevealBatch(events: readonly DomainEvent[], playerId: string): void
  /** The frame's authority tick: ends a reveal whose time ran out, or that a restore undid. */
  advanceRevealTo(tick: number): void
  /** The plate's tap. */
  skipReveal(): void
}

export const useRevealStore = create<RevealState>()((set, get) => ({
  reveal: null,
  hearRevealBatch: (events, playerId) => {
    if (hasLeftDock(events, playerId)) endReveal()
    const reveal = revealOfBatch(events, playerId)
    if (reveal === null) return
    set({ reveal })
    useGameStore.getState().stepSheetAside()
  },
  advanceRevealTo: (tick) => {
    const { reveal } = get()
    if (reveal !== null && !isRevealPlayingAt(reveal, tick)) endReveal()
  },
  skipReveal: endReveal,
}))

/** For specs' `beforeEach`. */
export function resetRevealStore(): void {
  useRevealStore.setState({ reveal: null })
}

function endReveal(): void {
  if (useRevealStore.getState().reveal === null) return
  useRevealStore.setState({ reveal: null })
  useGameStore.getState().bringSheetBack()
}

function hasLeftDock(events: readonly DomainEvent[], playerId: string): boolean {
  return events.some((event) => event.type === 'DockLeft' && event.playerId === playerId)
}
