/**
 * The coin cascade's notes (#171 "Sound": in #180's pentatonic key, so it stays musical however
 * many coins land): the cascade climbs a major pentatonic scale from an octave under the pickup
 * chime, capped two octaves up; the flare's bell rings an octave over the pickup chime.
 */
import { CHIME_BASE_HZ } from '../../../../constants/audio'

const PENTATONIC = [0, 2, 4, 7, 9]
const SEMITONES_PER_OCTAVE = 12
/** Two octaves of the scale. */
const HIGHEST_NOTE = 2 * PENTATONIC.length

/** The cascade's tonic, an octave under the pickup chime so the coins sit beneath it. */
const CASCADE_TONIC_HZ = CHIME_BASE_HZ / 2

export const FLARE_BELL_HZ = CHIME_BASE_HZ * 2

export function cascadeHzOf(note: number): number {
  const step = Math.min(Math.max(0, note), HIGHEST_NOTE)
  const octave = Math.floor(step / PENTATONIC.length)
  const semitones = octave * SEMITONES_PER_OCTAVE + PENTATONIC[step % PENTATONIC.length]
  return CASCADE_TONIC_HZ * 2 ** (semitones / SEMITONES_PER_OCTAVE)
}
