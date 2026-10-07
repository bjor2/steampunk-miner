/**
 * Slice sound cues as Web Audio (#180; K-b ticket 227): a cue's partials struck together and its
 * noise band under them, through one envelope that strikes in 5 ms and rings out over the tone's
 * seconds, like the kernel's own one-shots. The voice it returns can be faded early, which is how
 * the voice budget steals a cue's oldest voice without a click.
 */
import type { CueTone, SoundCuePlay } from '../systems/registries/soundCues'
import { gainOf, SILENCE } from './audioNodes'
import type { CueVoice } from './soundOut'

const STRIKE_SECONDS = 0.005
const SEMITONES_PER_OCTAVE = 12

export function playCueTone(
  context: AudioContext,
  master: GainNode,
  noise: AudioBuffer,
  tone: CueTone,
  play: SoundCuePlay,
): CueVoice {
  const start = context.currentTime
  const envelope = strikeEnvelope(context, master, start, tone.seconds, play.gain)
  const ratio = 2 ** (play.pitchSemitones / SEMITONES_PER_OCTAVE)
  const sources = [
    ...tone.partials.map((partial) => startPartial(context, envelope, partial, ratio, start)),
    ...(tone.noise === null ? [] : [startNoise(context, envelope, noise, tone.noise, start)]),
  ]
  sources.forEach((source) => source.stop(start + tone.seconds))
  return { fadeOut: (seconds) => fadeVoice(context, envelope, sources, seconds) }
}

function strikeEnvelope(
  context: AudioContext,
  master: GainNode,
  start: number,
  seconds: number,
  level: number,
): GainNode {
  const envelope = gainOf(context, SILENCE, master)
  envelope.gain.setValueAtTime(SILENCE, start)
  envelope.gain.exponentialRampToValueAtTime(Math.max(level, SILENCE), start + STRIKE_SECONDS)
  envelope.gain.exponentialRampToValueAtTime(SILENCE, start + seconds)
  return envelope
}

function startPartial(
  context: AudioContext,
  envelope: GainNode,
  partial: CueTone['partials'][number],
  ratio: number,
  start: number,
): AudioScheduledSourceNode {
  const level = gainOf(context, partial.gain, envelope)
  const frequency = partial.frequency * ratio
  const oscillator = new OscillatorNode(context, { type: partial.wave, frequency })
  oscillator.connect(level)
  oscillator.start(start)
  return oscillator
}

function startNoise(
  context: AudioContext,
  envelope: GainNode,
  buffer: AudioBuffer,
  band: NonNullable<CueTone['noise']>,
  start: number,
): AudioScheduledSourceNode {
  const level = gainOf(context, band.gain, envelope)
  const filter = new BiquadFilterNode(context, {
    type: 'bandpass',
    frequency: band.frequency,
    Q: band.q,
  })
  filter.connect(level)
  const source = new AudioBufferSourceNode(context, { buffer, loop: true })
  source.connect(filter)
  source.start(start)
  return source
}

/** Ramps the voice to silence over `seconds` from now and stops it there. */
function fadeVoice(
  context: AudioContext,
  envelope: GainNode,
  sources: readonly AudioScheduledSourceNode[],
  seconds: number,
): void {
  const now = context.currentTime
  envelope.gain.cancelScheduledValues(now)
  envelope.gain.setValueAtTime(Math.max(envelope.gain.value, SILENCE), now)
  envelope.gain.exponentialRampToValueAtTime(SILENCE, now + seconds)
  sources.forEach((source) => source.stop(now + seconds))
}
