/**
 * Keeps the stage and the UI fitted to the screen (#173): lays the screen out again on every
 * resize, rotation, change of pointer and switch of TV mode, and hands the result to the shell as
 * the page root's custom properties. The one writer of those properties.
 */
import type { Shell } from '../../shell/shell'
import { useGameStore, type GameState } from '../../store/gameStore'
import { screenLayoutOf, screenStyleOf, type ScreenLayout } from '../../systems/views/screenLayout'

let fitted: ScreenLayout | null = null

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

function fitScreen(shell: Shell): void {
  fitted = screenLayoutOf(shell.readScreen(), useGameStore.getState().prefs.tvMode)
  shell.setScreenStyle(screenStyleOf(fitted))
}

function refitOnTvModeSwitch(state: GameState, previous: GameState, fit: () => void): void {
  if (state.prefs.tvMode !== previous.prefs.tvMode) fit()
}
