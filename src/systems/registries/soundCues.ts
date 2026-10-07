/**
 * Sounds a slice adds (#180 escalating purchase audio; K-b ticket 227, TD lock on #177): each cue
 * is a synthesised placeholder tone (#13: every sound is built in the browser's audio engine) with
 * its voice budget, the most of it that may sound at once. A slice asks for a cue by id with
 * `requestSoundCue` (`store/soundCueRequests.ts`); the sound stage plays it through `SoundOut`,
 * and past the budget the cue's oldest voice is stolen with a short fade. Slices never touch audio
 * themselves, and a scene layer still never writes the sound. With no cue registered nothing new
 * sounds.
 */
import { defineRegistry, entriesOf, type SealedRegistration } from './seal'

export type CueWave = 'sine' | 'square' | 'sawtooth' | 'triangle'

/** One oscillator struck with the others; a request's pitch shift moves every partial alike. */
export interface CuePartial {
  wave: CueWave
  /** Hz before the request's pitch shift. */
  frequency: number
  /** Peak level, 0 to 1. */
  gain: number
}

/** A band of noise under the partials: a clank's metal, a valve's hiss. */
export interface CueNoise {
  /** The band's centre, Hz; it does not shift with pitch. */
  frequency: number
  q: number
  gain: number
}

/** What a cue sounds like: struck at once, then ringing out over `seconds`. */
export interface CueTone {
  partials: readonly CuePartial[]
  noise: CueNoise | null
  /** How long a voice rings, and so holds its place in the budget. */
  seconds: number
}

export interface SoundCue {
  id: string
  /** The most voices of this cue sounding at once, a whole number from 1 (#180: 4 ratchet, 1 flourish). */
  voices: number
  tone: CueTone
}

/** One play of a cue: semitones up (down when negative) and a level times the tone's own. */
export interface SoundCuePlay {
  pitchSemitones: number
  gain: number
}

export const SOUND_CUE_REGISTRY = defineRegistry<SoundCue>('soundCues', soundCueSealProblem)

/** The registered cue `id`, or null. */
export function soundCueById(id: string): SoundCue | null {
  return entriesOf(SOUND_CUE_REGISTRY).find((cue) => cue.id === id) ?? null
}

/** Why the cue cannot be played as registered; empty when it can. */
export function soundCueProblems(cue: SoundCue): string[] {
  return [
    ...(Number.isInteger(cue.voices) && cue.voices >= 1
      ? []
      : ['its voices are a whole number from 1']),
    ...(cue.tone.seconds > 0 ? [] : ['its tone rings for no time']),
    ...(isSilent(cue.tone) ? ['its tone has no partial and no noise'] : []),
    ...cue.tone.partials.flatMap(partialProblems),
  ]
}

function soundCueSealProblem(
  registrations: readonly SealedRegistration<SoundCue>[],
): string | null {
  const problems = registrations.flatMap(({ entry }) =>
    soundCueProblems(entry).map((problem) => `sound cue "${entry.id}": ${problem}`),
  )
  return problems.length === 0 ? null : problems.join('; ')
}

function isSilent(tone: CueTone): boolean {
  return tone.partials.length === 0 && tone.noise === null
}

function partialProblems(partial: CuePartial, at: number): string[] {
  return partial.frequency > 0 && partial.gain > 0 && partial.gain <= 1
    ? []
    : [`partial ${at} needs a frequency above 0 and a gain in (0, 1]`]
}
