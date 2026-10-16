/**
 * The game store's sound-unlock slice (#470 P1-7, ticket 478): whether the browser lets the game's
 * sound play, as the sound output last reported it, so the stage can ask for a tap while a gesture
 * left the audio context suspended. UI state only: never a command, a log line or the digest.
 */
import type { SoundUnlock } from '../systems/audio/soundUnlock'

export interface SoundUnlockValues {
  soundUnlock: SoundUnlock
}

export interface SoundUnlockActions {
  /** The sound output's report: a gesture or the page's return tried, or the context changed. */
  noteSoundUnlock(unlock: SoundUnlock): void
}

type SetSlice = (partial: Partial<SoundUnlockValues>) => void

export const STARTING_SOUND_UNLOCK: SoundUnlockValues = { soundUnlock: 'awaitingGesture' }

export function soundUnlockActionsOf(set: SetSlice): SoundUnlockActions {
  return { noteSoundUnlock: (unlock) => set({ soundUnlock: unlock }) }
}
