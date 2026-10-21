/**
 * What the touch controls follow outside React (#173): they show at start on a coarse pointer and
 * on every touch (a key hides them, in the input runtime), a touch resumes a step held while the
 * page was hidden (ticket 472), and the haptics buzz on drill contact, hull damage and each
 * warning ladder tier (10, 30 and 60 ms, ticket 685) while the setting is on, through the shell's
 * vibration motor.
 */
import type { Shell } from '../../shell/shell'
import { listenForFeedback } from '../../store/feedbackBroadcast'
import { listenForWarnings } from '../../store/warningBroadcast'
import { useGameStore } from '../../store/gameStore'
import { hapticPulseMsOf } from '../../systems/feedback/haptics'

export function showTouchControlsOnTouch(shell: Shell): void {
  if (shell.readScreen().isCoarsePointer) useGameStore.getState().showTouchControls()
  shell.onTouchInput(followTouch)
}

function followTouch(): void {
  useGameStore.getState().showTouchControls()
  useGameStore.getState().resumeLiveStepOnTap()
}

export function keepHapticsPlaying(shell: Shell): void {
  listenForFeedback((cue) => buzzFor(shell, hapticPulseMsOf(cue)))
  listenForWarnings((firing) => buzzFor(shell, firing.hapticMs))
}

function buzzFor(shell: Shell, pulseMs: number | null): void {
  if (pulseMs !== null && useGameStore.getState().prefs.haptics) shell.vibrate(pulseMs)
}
