/**
 * Plays the pickup chime within its cap (ticket 615, the G&V bar on #442 for option A): at most
 * 12 a second, pickups past that merged into the next chime at the highest tier held
 * (`systems/audio/pickupChimeCap.ts`). Owned by the sound stage, which counts the gap down with
 * `advance` every frame.
 */
import type { SoundOut } from '../shell/soundOut'
import { chimeFrequencyOf } from '../systems/audio/soundRules'
import {
  createPickupChimeCap,
  offerPickupChime,
  takeDueChime,
} from '../systems/audio/pickupChimeCap'

export interface PickupChimePlayer {
  play(tier: number): void
  /** The frame's render delta, in seconds. */
  advance(dt: number): void
}

export function createPickupChimePlayer(sound: SoundOut): PickupChimePlayer {
  const cap = createPickupChimeCap()
  return {
    play: (tier) => playChimeOf(sound, offerPickupChime(cap, tier)),
    advance: (dt) => playChimeOf(sound, takeDueChime(cap, dt)),
  }
}

/** The chime climbs the scale with the tier (#13); null is a pickup held for the next one. */
function playChimeOf(sound: SoundOut, tier: number | null): void {
  if (tier !== null) sound.playChime(chimeFrequencyOf(tier))
}
