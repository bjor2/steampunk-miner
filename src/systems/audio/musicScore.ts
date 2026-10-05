/**
 * The step sequencer's rules (#49): a pattern read once into the notes it strikes, and which of
 * them start inside a window of the music's clock. The shell's sequencer asks for the next slice of
 * time each frame and schedules what comes back, so a loop plays each note once however the time
 * is sliced, the same at any frame rate. Seconds count from when the music started.
 */
import { stepsPerBarOf, type MusicPattern, type MusicVoice } from './musicPattern'

export interface ScoreNote {
  voice: MusicVoice
  gain: number
  /** Semitones above the pattern's root; a hit sounds at the root of its octave. */
  semitones: number
  /** Seconds after the start of the loop. */
  atSeconds: number
  seconds: number
}

export interface MusicScore {
  id: string
  rootHz: number
  loopSeconds: number
  /** In the order they start. */
  notes: readonly ScoreNote[]
}

export type NoteVisitor = (note: ScoreNote, atSeconds: number) => void

const SECONDS_PER_MINUTE = 60
const SEMITONES_PER_OCTAVE = 12
const REST = '.'
const HOLD = '-'

export function scoreOfPattern(pattern: MusicPattern): MusicScore {
  const stepSeconds = SECONDS_PER_MINUTE / pattern.tempoBpm / pattern.stepsPerBeat
  const notes = pattern.instruments
    .flatMap((instrument) => notesOfInstrument(pattern, instrument, stepSeconds))
    .sort((a, b) => a.atSeconds - b.atSeconds)
  return {
    id: pattern.id,
    rootHz: pattern.rootHz,
    loopSeconds: pattern.barCount * stepsPerBarOf(pattern) * stepSeconds,
    notes,
  }
}

/** Every note of the endless loop that starts in `[fromSeconds, toSeconds)`, in order. */
export function visitLoopNotesBetween(
  score: MusicScore,
  fromSeconds: number,
  toSeconds: number,
  visit: NoteVisitor,
): void {
  const firstLoop = Math.floor(fromSeconds / score.loopSeconds)
  for (let loop = firstLoop; loop * score.loopSeconds < toSeconds; loop++) {
    visitNotesOfLoop(score, loop * score.loopSeconds, fromSeconds, toSeconds, visit)
  }
}

/** A note's pitch on a planet tuned `tuningSemitones` away from planet 1. */
export function frequencyOfNote(
  score: MusicScore,
  note: ScoreNote,
  tuningSemitones: number,
): number {
  return score.rootHz * 2 ** ((note.semitones + tuningSemitones) / SEMITONES_PER_OCTAVE)
}

function visitNotesOfLoop(
  score: MusicScore,
  loopStart: number,
  fromSeconds: number,
  toSeconds: number,
  visit: NoteVisitor,
): void {
  for (const note of score.notes) {
    const at = loopStart + note.atSeconds
    if (at >= fromSeconds && at < toSeconds) visit(note, at)
  }
}

function notesOfInstrument(
  pattern: MusicPattern,
  instrument: MusicPattern['instruments'][number],
  stepSeconds: number,
): ScoreNote[] {
  const steps = instrument.bars.join('')
  const notes: ScoreNote[] = []
  for (let step = 0; step < steps.length; step++) {
    if (!isStruck(steps[step])) continue
    notes.push({
      voice: instrument.voice,
      gain: instrument.gain,
      semitones: semitonesOf(pattern.scale, steps[step], instrument.octave),
      atSeconds: step * stepSeconds,
      seconds: ringingStepsFrom(steps, step) * stepSeconds,
    })
  }
  return notes
}

function isStruck(step: string): boolean {
  return step !== REST && step !== HOLD
}

/** The struck step and every `-` after it. */
function ringingStepsFrom(steps: string, struckAt: number): number {
  let end = struckAt + 1
  while (end < steps.length && steps[end] === HOLD) end++
  return end - struckAt
}

/** Degree 1 is the root; a hit (`x`) sounds at the root. */
function semitonesOf(scale: readonly number[], step: string, octave: number): number {
  const degreeIndex = step === 'x' ? 0 : Number.parseInt(step, 10) - 1
  const octavesUp = Math.floor(degreeIndex / scale.length) + octave
  return scale[degreeIndex % scale.length] + octavesUp * SEMITONES_PER_OCTAVE
}
