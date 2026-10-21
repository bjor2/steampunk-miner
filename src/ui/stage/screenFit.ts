/**
 * Keeps the stage and the UI fitted to the screen (#173): lays the screen out again on every
 * resize, rotation, change of pointer and switch of TV mode, and hands the result to the shell as
 * the page root's custom properties, its `data-orientation` (ticket 483), its
 * `data-hud-density` (#500) and the design system's `data-layout` (ticket 682). The one writer of
 * them all, so panels switch their portrait layout, the HUD its compact one and the tokens their
 * phone or desktop values from this one source; React reads the layout through
 * `subscribeFittedScreen`, which a refit notifies.
 */
import type { Shell } from '../../shell/shell'
import { useGameStore, type GameState } from '../../store/gameStore'
import {
  screenAttributesOf,
  screenLayoutOf,
  screenStyleOf,
  type ScreenLayout,
} from '../../systems/views/screenLayout'

let fitted: ScreenLayout | null = null
const listeners = new Set<() => void>()

export function keepScreenFitted(shell: Shell): void {
  const fit = () => fitScreen(shell)
  shell.onScreenChange(fit)
  useGameStore.subscribe((state, previous) => refitOnTvModeSwitch(state, previous, fit))
  fit()
}

/** The layout last written, for the debug API; null before the first fit. */
export function readFittedScreen(): ScreenLayout | null {
  return fitted
}

/** Calls `listener` after every refit; returns the unsubscribe (`useSyncExternalStore`'s shape). */
export function subscribeFittedScreen(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function fitScreen(shell: Shell): void {
  fitted = screenLayoutOf(shell.readScreen(), useGameStore.getState().prefs.tvMode)
  shell.setScreenStyle(screenStyleOf(fitted))
  shell.setScreenAttributes(screenAttributesOf(fitted))
  listeners.forEach((listener) => listener())
}

function refitOnTvModeSwitch(state: GameState, previous: GameState, fit: () => void): void {
  if (state.prefs.tvMode !== previous.prefs.tvMode) fit()
}
