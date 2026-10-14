/**
 * Plays the slices' requested one-shots in the kernel's own voices (TD lock on #288 Q2; ticket
 * 372), each id at most once a frame however often it is asked, so a burst of requests never
 * stacks clanks. Owned by the sound stage, which ends each frame with `advance`.
 */
import type { SoundOut } from '../shell/soundOut'
import type { KernelVoice, OneShot } from '../systems/registries/oneShots'

export interface OneShotPlayer {
  play(oneShot: OneShot): void
  /** Ends the frame: every id may sound once more. */
  advance(): void
}

const KERNEL_VOICES: Readonly<Record<KernelVoice, (sound: SoundOut) => void>> = {
  clankLight: (sound) => sound.playClank('light'),
}

export function createOneShotPlayer(sound: SoundOut): OneShotPlayer {
  const playedThisFrame = new Set<string>()
  return {
    play: (oneShot) => playOncePerFrame(sound, playedThisFrame, oneShot),
    advance: () => playedThisFrame.clear(),
  }
}

function playOncePerFrame(sound: SoundOut, playedThisFrame: Set<string>, oneShot: OneShot): void {
  if (playedThisFrame.has(oneShot.id)) return
  playedThisFrame.add(oneShot.id)
  KERNEL_VOICES[oneShot.voice](sound)
}
