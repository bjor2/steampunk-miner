/**
 * The burst's cues bound to the shell's existing voices (TD lock on #176: no new SoundOut voice):
 * the clatter is the thud, the ticker clacks are the light clank, the cascade and the bell are the
 * chime, and the peeled coins' landing is the heavy clank (G&V on #176).
 */
import type { SoundOut } from '../../../shell/soundOut'
import type { BurstCuePlayer } from '../systems/burstCues'
import { cascadeHzOf, FLARE_BELL_HZ } from '../systems/render/cascadePitch'

export function burstCuePlayerOf(sound: SoundOut): BurstCuePlayer {
  return {
    clatter: () => sound.playThud(),
    clack: () => sound.playClank('light'),
    coin: (note) => sound.playChime(cascadeHzOf(note)),
    peel: () => sound.playClank('heavy'),
    bell: () => sound.playChime(FLARE_BELL_HZ),
  }
}
