/**
 * A music pattern as data (#49 "Patterns are JSON (tempo, scale, steps per instrument)"): the four
 * layers and the three stingers are short authored loops a small step sequencer plays on the Web
 * Audio synth, so music is data that tests check the way sounds are. Stems can later replace a
 * pattern layer by layer without changing any trigger.
 *
 * A bar is a string with one character per step:
 *   `.` rest   `-` the note before rings on   `1`-`9` a scale degree   `x` a hit (the noise voice)
 * Degree 1 is the root; degrees past the scale's length climb into the next octave.
 *
 * Refused whole at load on any problem, like the hint table and the action map.
 */

export const MUSIC_VOICES = ['sine', 'triangle', 'sawtooth', 'square', 'noise'] as const
export type MusicVoice = (typeof MUSIC_VOICES)[number]

export interface MusicInstrument {
  name: string
  voice: MusicVoice
  /** Whole octaves above (or below, negative) the pattern's root. */
  octave: number
  gain: number
  /** One string per bar, `beatsPerBar * stepsPerBeat` characters each. */
  bars: readonly string[]
}

export interface MusicPattern {
  id: string
  tempoBpm: number
  beatsPerBar: number
  stepsPerBeat: number
  barCount: number
  rootHz: number
  /** Semitones above the root of each scale degree: starts at 0, rises, stays inside an octave. */
  scale: readonly number[]
  instruments: readonly MusicInstrument[]
}

const TEMPO_RANGE = { min: 40, max: 240 }
const ROOT_RANGE = { min: 20, max: 2000 }
const OCTAVE_RANGE = { min: -3, max: 3 }
const MAX_BEATS_PER_BAR = 8
const MAX_STEPS_PER_BEAT = 4
const MAX_BARS = 32
const SEMITONES_PER_OCTAVE = 12
const PITCHED_STEP = /^[.\-1-9]*$/
const HIT_STEP = /^[.x]*$/

/** Every problem in a raw pattern, each naming the pattern; empty when it can be played. */
export function musicPatternProblems(raw: unknown): string[] {
  if (!isRecord(raw)) return ['a music pattern must be an object']
  const name = typeof raw.id === 'string' ? `pattern ${JSON.stringify(raw.id)}` : 'pattern'
  return [
    ...(typeof raw.id === 'string' && raw.id.length > 0 ? [] : ['id must be a non-empty text']),
    ...wholeInRangeProblems('tempoBpm', raw.tempoBpm, TEMPO_RANGE),
    ...wholeInRangeProblems('beatsPerBar', raw.beatsPerBar, { min: 1, max: MAX_BEATS_PER_BAR }),
    ...wholeInRangeProblems('stepsPerBeat', raw.stepsPerBeat, { min: 1, max: MAX_STEPS_PER_BEAT }),
    ...wholeInRangeProblems('barCount', raw.barCount, { min: 1, max: MAX_BARS }),
    ...numberInRangeProblems('rootHz', raw.rootHz, ROOT_RANGE),
    ...scaleProblems(raw.scale),
    ...instrumentListProblems(raw),
  ].map((problem) => `${name}: ${problem}`)
}

export function stepsPerBarOf(pattern: Pick<MusicPattern, 'beatsPerBar' | 'stepsPerBeat'>): number {
  return pattern.beatsPerBar * pattern.stepsPerBeat
}

function instrumentListProblems(raw: Record<string, unknown>): string[] {
  if (!Array.isArray(raw.instruments) || raw.instruments.length === 0) {
    return ['instruments must be a non-empty list']
  }
  const shape = barShapeOf(raw)
  return raw.instruments.flatMap((instrument, index) =>
    instrumentProblems(instrument, `instruments[${index}]`, shape),
  )
}

interface BarShape {
  barCount: unknown
  stepsPerBar: number | null
}

function barShapeOf(raw: Record<string, unknown>): BarShape {
  const isShaped = Number.isSafeInteger(raw.beatsPerBar) && Number.isSafeInteger(raw.stepsPerBeat)
  return {
    barCount: raw.barCount,
    stepsPerBar: isShaped ? (raw.beatsPerBar as number) * (raw.stepsPerBeat as number) : null,
  }
}

function instrumentProblems(raw: unknown, at: string, shape: BarShape): string[] {
  if (!isRecord(raw)) return [`${at} must be an object`]
  const where = typeof raw.name === 'string' ? `${at} (${raw.name})` : at
  return [
    ...(typeof raw.name === 'string' && raw.name.length > 0 ? [] : ['name must be a text']),
    ...(MUSIC_VOICES.includes(raw.voice as MusicVoice)
      ? []
      : [`voice must be one of ${MUSIC_VOICES.join(', ')}, got ${JSON.stringify(raw.voice)}`]),
    ...wholeInRangeProblems('octave', raw.octave, OCTAVE_RANGE),
    ...numberInRangeProblems('gain', raw.gain, { min: 0, max: 1 }),
    ...barsProblems(raw.bars, raw.voice === 'noise' ? HIT_STEP : PITCHED_STEP, shape),
  ].map((problem) => `${where} ${problem}`)
}

function barsProblems(bars: unknown, allowedSteps: RegExp, shape: BarShape): string[] {
  if (!Array.isArray(bars)) return ['bars must be a list of texts']
  return [
    ...(bars.length === shape.barCount
      ? []
      : [`has ${bars.length} bars, the pattern has ${String(shape.barCount)}`]),
    ...bars.flatMap((bar, index) => barProblems(bar, index + 1, allowedSteps, shape.stepsPerBar)),
  ]
}

function barProblems(
  bar: unknown,
  barNumber: number,
  allowedSteps: RegExp,
  stepsPerBar: number | null,
): string[] {
  if (typeof bar !== 'string') return [`bar ${barNumber} must be a text`]
  return [
    ...(stepsPerBar === null || bar.length === stepsPerBar
      ? []
      : [`bar ${barNumber} has ${bar.length} steps, expected ${stepsPerBar}`]),
    ...(allowedSteps.test(bar)
      ? []
      : [`bar ${barNumber} ${JSON.stringify(bar)} has a step its voice cannot play`]),
  ]
}

function scaleProblems(scale: unknown): string[] {
  const isScale =
    Array.isArray(scale) &&
    scale[0] === 0 &&
    scale.every((semitones, index) => isScaleStep(semitones, index === 0 ? -1 : scale[index - 1]))
  return isScale ? [] : ['scale must start at 0 and rise in whole semitones below 12']
}

function isScaleStep(semitones: unknown, previous: unknown): boolean {
  return (
    Number.isSafeInteger(semitones) &&
    (semitones as number) > (previous as number) &&
    (semitones as number) < SEMITONES_PER_OCTAVE
  )
}

function wholeInRangeProblems(
  field: string,
  value: unknown,
  range: { min: number; max: number },
): string[] {
  return Number.isSafeInteger(value) && isInRange(value as number, range)
    ? []
    : [`${field} must be a whole number from ${range.min} to ${range.max}`]
}

function numberInRangeProblems(
  field: string,
  value: unknown,
  range: { min: number; max: number },
): string[] {
  return typeof value === 'number' && isInRange(value, range)
    ? []
    : [`${field} must be a number from ${range.min} to ${range.max}`]
}

function isInRange(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
