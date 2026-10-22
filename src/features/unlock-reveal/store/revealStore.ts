/**
 * The unlock reveal's UI state (ticket 718; feature-slices.md 6.4: a slice keeps its UI state in
 * its `store/`): the reveal playing now, started by the local player's first buy of a new
 * capability and ended when its time runs out, on a tap, or when the rig leaves the dock. While it
 * plays a phone's full sheet steps aside so the car shows, and comes back on its tab after; the
 * game store's `stepSheetAside` and `bringSheetBack` are the only writes, and nothing submits.
 * A browser spec or the screenshot suite may hold the reveal so its time never runs out (a tap or
 * leaving the dock still ends it): a held plate is still there when the shot is taken.
 */
import { create } from 'zustand'
import { useGameStore } from '../../../store/gameStore'
import type { DomainEvent } from '../../../systems/authority/domainEvent'
import { isRevealPlayingAt, revealOfBatch, type UnlockReveal } from '../systems/unlockReveal'

interface RevealState {
  reveal: UnlockReveal | null
  /** The debug hold: time never ends the reveal playing now, or the next; its end lets go. */
  isHeld: boolean
  /** A `listenForDomainEvents` listener: a new capability bought starts its reveal. */
  hearRevealBatch(events: readonly DomainEvent[], playerId: string): void
  /** The frame's authority tick: ends a reveal whose time ran out, or that a restore undid. */
  advanceRevealTo(tick: number): void
  /** The plate's tap. */
  skipReveal(): void
  /** For a spec or a shot: the reveal stays until a tap or leaving the dock. */
  holdReveal(): void
  letRevealRun(): void
}

export const useRevealStore = create<RevealState>()((set, get) => ({
  reveal: null,
  isHeld: false,
  hearRevealBatch: (events, playerId) => {
    if (hasLeftDock(events, playerId)) endReveal()
    const reveal = revealOfBatch(events, playerId)
    if (reveal === null) return
    set({ reveal })
    useGameStore.getState().stepSheetAside()
  },
  advanceRevealTo: (tick) => {
    if (hasRunOutAt(get(), tick)) endReveal()
  },
  skipReveal: endReveal,
  holdReveal: () => set({ isHeld: true }),
  letRevealRun: () => set({ isHeld: false }),
}))

/** For specs' `beforeEach`. */
export function resetRevealStore(): void {
  useRevealStore.setState({ reveal: null, isHeld: false })
}

function endReveal(): void {
  if (useRevealStore.getState().reveal === null) return
  useRevealStore.setState({ reveal: null, isHeld: false })
  useGameStore.getState().bringSheetBack()
}

/** Time ended it (unless held), or a restore went back to before its buy. */
function hasRunOutAt({ reveal, isHeld }: Pick<RevealState, 'reveal' | 'isHeld'>, tick: number) {
  if (reveal === null) return false
  return tick < reveal.startTick || (!isHeld && !isRevealPlayingAt(reveal, tick))
}

function hasLeftDock(events: readonly DomainEvent[], playerId: string): boolean {
  return events.some((event) => event.type === 'DockLeft' && event.playerId === playerId)
}
