/**
 * The soft valve click an auto toggle plays (ticket 317, Gameplay on #310): a short bright tick
 * over a little hiss, a synthesised placeholder as every #13 sound is. Never the clank, which
 * still means a blocked shot.
 */
import {
  VALVE_CLICK_GAIN,
  VALVE_CLICK_HISS_GAIN,
  VALVE_CLICK_HISS_HZ,
  VALVE_CLICK_HZ,
  VALVE_CLICK_SECONDS,
} from '../../constants/audio'
import type { CueTone, SoundCuePlay } from '../registries/soundCues'

/** A narrow-ish band: the hiss of the valve seating, not a broad rush. */
const HISS_Q = 2

export const VALVE_CLICK_TONE: CueTone = {
  partials: [{ wave: 'triangle', frequency: VALVE_CLICK_HZ, gain: VALVE_CLICK_GAIN }],
  noise: { frequency: VALVE_CLICK_HISS_HZ, q: HISS_Q, gain: VALVE_CLICK_HISS_GAIN },
  seconds: VALVE_CLICK_SECONDS,
}

export const VALVE_CLICK_PLAY: SoundCuePlay = { pitchSemitones: 0, gain: 1 }
