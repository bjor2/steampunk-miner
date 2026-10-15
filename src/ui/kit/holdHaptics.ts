/**
 * The tick felt when a touch hold opens a card or a tooltip (#173 haptics setting, Gameplay &
 * Vehicle on #164): the one place the kit reads the setting and reaches the shell for it.
 */
import { getShell } from '../../shell/shell'
import { useGameStore } from '../../store/gameStore'

export function tickHapticsOnHold(durationMs: number): void {
  if (useGameStore.getState().prefs.haptics) getShell().vibrate(durationMs)
}
