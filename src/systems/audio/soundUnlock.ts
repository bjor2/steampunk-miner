/**
 * When the game's sound may start (#470 P1-7, ticket 478). Browsers start Web Audio only inside a
 * user gesture, and which gestures count differs: desktop Chromium takes a key or a pointer press,
 * iOS Safari only a `touchend` or a `click`, and it suspends a running context again after an
 * interruption (a call, the app switcher) until the next gesture resumes it. So every gesture in
 * the list tries, not only the first, and a context that stays suspended after a try asks the
 * player for a tap. The iOS half is platform behaviour, unverified until the real-device check
 * (P1-11, ticket 482). Sound is never authority state: none of this touches the sim.
 */

/** The page events whose handler may start or resume the audio context. */
export const AUDIO_UNLOCK_EVENTS = ['keydown', 'pointerdown', 'touchend', 'click'] as const

export type AudioUnlockEvent = (typeof AUDIO_UNLOCK_EVENTS)[number]

/** An audio context's state as browsers report it; `interrupted` is WebKit's. */
export type SoundContextState = 'suspended' | 'running' | 'closed' | 'interrupted'

/**
 * `awaitingGesture`: no context yet, no gesture has come. `sounding`: the context runs.
 * `suspended`: a gesture or a return to the page tried and the context still does not run.
 * `closed`: the context is gone; the game never closes it.
 */
export type SoundUnlock = 'awaitingGesture' | 'sounding' | 'suspended' | 'closed'

/** Null while no gesture has built the context. */
export function soundUnlockOf(contextState: SoundContextState | null): SoundUnlock {
  if (contextState === null) return 'awaitingGesture'
  if (contextState === 'running') return 'sounding'
  if (contextState === 'closed') return 'closed'
  return 'suspended'
}

/** A context a gesture or the page's return should resume: suspended or interrupted. */
export function isResumeNeeded(contextState: SoundContextState): boolean {
  return contextState === 'suspended' || contextState === 'interrupted'
}

/** The "tap for sound" chip shows only once a try left the context suspended. */
export function isTapForSoundShown(unlock: SoundUnlock): boolean {
  return unlock === 'suspended'
}
