/**
 * What the touch controls follow outside React (#173): they show at start on a coarse pointer and
 * on every touch (a key hides them, in the input runtime), a touch resumes a step held while the
 * page was hidden (ticket 472), and the haptics buzz on drill contact and hull damage while the
 * setting is on, through the shell's vibration motor.
 */
import type { Shell } from '../../shell/shell'
import { listenForFeedback } from '../../store/feedbackBroadcast'
import { useGameStore } from '../../store/gameStore'
import { hapticPulseMsOf } from '../../systems/feedback/haptics'
import type { FeedbackCue } from '../../systems/feedback/feedbackCues'

export function showTouchControlsOnTouch(shell: Shell): void {
  if (shell.readScreen().isCoarsePointer) useGameStore.getState().showTouchControls()
  shell.onTouchInput(followTouch)
}

function followTouch(): void {
  useGameStore.getState().showTouchControls()
  useGameStore.getState().resumeLiveStepOnTap()
}

export function keepHapticsPlaying(shell: Shell): void {
  listenForFeedback((cue) => buzzFor(shell, cue))
}

function buzzFor(shell: Shell, cue: FeedbackCue): void {
  const pulseMs = hapticPulseMsOf(cue)
  if (pulseMs !== null && useGameStore.getState().prefs.haptics) shell.vibrate(pulseMs)
}
