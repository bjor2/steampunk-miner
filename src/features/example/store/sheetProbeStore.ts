/**
 * Whether the example's sheet tabs show, and the card the last act pressed (ticket 686).
 * Presentation only, like the test piece (feature-slices.md 3.18): the debug actions flip it for
 * the kernel e2e and the screenshot suite, and it is never saved, logged or part of `GameState`.
 */
import { create } from 'zustand'

interface SheetProbeState {
  isShown: boolean
  /** The card whose action ran last; null before any did. */
  actedCardId: string | null
}

export const useSheetProbeStore = create<SheetProbeState>(() => ({
  isShown: false,
  actedCardId: null,
}))

export function showSheetProbeTabs(): void {
  useSheetProbeStore.setState({ isShown: true, actedCardId: null })
}

export function hideSheetProbeTabs(): void {
  useSheetProbeStore.setState({ isShown: false })
}

export function areSheetProbeTabsShown(): boolean {
  return useSheetProbeStore.getState().isShown
}

export function recordActedCard(cardId: string): void {
  useSheetProbeStore.setState({ actedCardId: cardId })
}

export function actedCardId(): string | null {
  return useSheetProbeStore.getState().actedCardId
}
