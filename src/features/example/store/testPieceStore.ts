/**
 * Whether the example's test piece hangs on the car (ticket 235). Presentation only, like opening
 * a slice screen (feature-slices.md 3.18): the debug actions flip it for the kernel e2e, and it is
 * never saved, logged or part of `GameState`.
 */
import { create } from 'zustand'

interface TestPieceState {
  isMounted: boolean
}

export const useTestPieceStore = create<TestPieceState>(() => ({ isMounted: false }))

export function mountTestPiece(): void {
  useTestPieceStore.setState({ isMounted: true })
}

export function unmountTestPiece(): void {
  useTestPieceStore.setState({ isMounted: false })
}
