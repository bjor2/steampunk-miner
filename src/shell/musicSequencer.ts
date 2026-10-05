/**
 * The step sequencer (#49): plays the music book's patterns on the synth. Each frame it schedules
 * the notes that start in the next short slice of the audio clock, only for layers loud enough to
 * hear, so the loops keep time however the frames fall. A stinger schedules its whole pattern at
 * once and ducks the layers 6 dB for its length; the volume, mute and the open artefact choice
 * arrive as one bus level. Which notes play is decided by `systems/audio/musicScore`.
 *
 * Every note is a fresh oscillator or noise burst that stops itself, as Web Audio requires; the
 * layer voices that schedule them are built once, so a frame adds no closures.
 */
import { DUCKED_SHARE, type MusicLayers } from '../systems/audio/musicLayers'
import type { LayerName, MusicBook, StingerId } from '../systems/audio/musicBook'
import {
  frequencyOfNote,
  visitLoopNotesBetween,
  type MusicScore,
  type NoteVisitor,
  type ScoreNote,
} from '../systems/audio/musicScore'
import { gainOf, glide, SILENCE } from './audioNodes'

export interface MusicSequencer {
  setMusic(layers: MusicLayers, tuningSemitones: number, busGain: number): void
  playStinger(stingerId: StingerId, tuningSemitones: number): void
}

/** The whole music's share of the master; the patterns' own gains mix inside it. */
const MUSIC_LEVEL = 0.35
/** Notes are scheduled this far ahead of the audio clock, longer than any frame. */
const LOOKAHEAD_SECONDS = 0.2
/** A layer quieter than this schedules nothing. */
const SILENT_LAYER = 0.001
const ATTACK_SECONDS = 0.01
const HIT_SECONDS = 0.06
const DUCK_IN_SECONDS = 0.03
const DUCK_OUT_SECONDS = 0.3
/** Noise hits pass above this, so they tick rather than rumble. */
const HIT_FILTER_HZ = 3000

interface Voice {
  context: AudioContext
  noise: AudioBuffer
  destination: AudioNode
  score: MusicScore
  tuning: number
  /** Seconds on the music's clock where the loop's time zero is in the audio clock. */
  startTime: number
}

interface LayerVoice extends Voice {
  out: GainNode
  play: NoteVisitor
}

export function createMusicSequencer(
  context: AudioContext,
  master: AudioNode,
  noise: AudioBuffer,
  book: MusicBook,
): MusicSequencer {
  const volume = gainOf(context, 1, gainOf(context, MUSIC_LEVEL, master))
  const duck = gainOf(context, 1, volume)
  const startTime = context.currentTime
  const layers = layerVoicesOf(context, noise, duck, book, startTime)
  const clock = { scheduledUntil: 0 }
  return {
    setMusic: (levels, tuning, busGain) => {
      glide(context, volume.gain, busGain)
      levelLayers(context, layers, levels)
      scheduleLayers(context, layers, clock, startTime, tuning)
    },
    playStinger: (stingerId, tuning) => {
      const voice = stingerVoiceOf(context, noise, volume, book.stingers[stingerId], tuning)
      playWholeScore(voice)
      duckFor(context, duck.gain, voice.score.loopSeconds)
    },
  }
}

function layerVoicesOf(
  context: AudioContext,
  noise: AudioBuffer,
  destination: AudioNode,
  book: MusicBook,
  startTime: number,
): Readonly<Record<LayerName, LayerVoice>> {
  const voiceOf = (name: LayerName): LayerVoice => {
    const out = gainOf(context, 0, destination)
    const layer: LayerVoice = {
      context,
      noise,
      destination: out,
      score: book.layers[name],
      tuning: 0,
      startTime,
      out,
      play: (note, atSeconds) => playNote(layer, note, layer.startTime + atSeconds),
    }
    return layer
  }
  return {
    platform: voiceOf('platform'),
    ambience: voiceOf('ambience'),
    tension: voiceOf('tension'),
    combat: voiceOf('combat'),
  }
}

function levelLayers(
  context: AudioContext,
  layers: Readonly<Record<LayerName, LayerVoice>>,
  levels: MusicLayers,
): void {
  for (const name of Object.keys(layers) as LayerName[]) {
    glide(context, layers[name].out.gain, levels[name])
  }
}

/** The next slice of every audible loop; a slice that fell behind (a hidden tab) is skipped. */
function scheduleLayers(
  context: AudioContext,
  layers: Readonly<Record<LayerName, LayerVoice>>,
  clock: { scheduledUntil: number },
  startTime: number,
  tuning: number,
): void {
  const now = context.currentTime - startTime
  const from = Math.max(clock.scheduledUntil, now)
  const to = now + LOOKAHEAD_SECONDS
  for (const name of Object.keys(layers) as LayerName[]) {
    const layer = layers[name]
    layer.tuning = tuning
    if (layer.out.gain.value > SILENT_LAYER)
      visitLoopNotesBetween(layer.score, from, to, layer.play)
  }
  clock.scheduledUntil = to
}

function stingerVoiceOf(
  context: AudioContext,
  noise: AudioBuffer,
  destination: AudioNode,
  score: MusicScore,
  tuning: number,
): Voice {
  return { context, noise, destination, score, tuning, startTime: context.currentTime }
}

function playWholeScore(voice: Voice): void {
  for (const note of voice.score.notes) playNote(voice, note, voice.startTime + note.atSeconds)
}

/** -6 dB at once, back to full as the stinger ends (#49). */
function duckFor(context: AudioContext, duck: AudioParam, seconds: number): void {
  const now = context.currentTime
  duck.cancelScheduledValues(now)
  duck.setTargetAtTime(DUCKED_SHARE, now, DUCK_IN_SECONDS)
  duck.setTargetAtTime(1, now + seconds, DUCK_OUT_SECONDS)
}

function playNote(voice: Voice, note: ScoreNote, at: number): void {
  if (note.voice === 'noise') playHit(voice, note, at)
  else playTone(voice, note, at)
}

function playTone(voice: Voice, note: ScoreNote, at: number): void {
  const { context } = voice
  const envelope = envelopeOf(context, voice.destination, note.gain, at, note.seconds)
  const oscillator = new OscillatorNode(context, {
    type: note.voice as OscillatorType,
    frequency: frequencyOfNote(voice.score, note, voice.tuning),
  })
  oscillator.connect(envelope)
  oscillator.start(at)
  oscillator.stop(at + note.seconds)
}

function playHit(voice: Voice, note: ScoreNote, at: number): void {
  const { context } = voice
  const envelope = envelopeOf(context, voice.destination, note.gain, at, HIT_SECONDS)
  const filter = new BiquadFilterNode(context, { type: 'highpass', frequency: HIT_FILTER_HZ })
  filter.connect(envelope)
  const burst = new AudioBufferSourceNode(context, { buffer: voice.noise })
  burst.connect(filter)
  burst.start(at, 0, HIT_SECONDS)
}

/** Strikes to `gain` and fades to silence by the end of the note. */
function envelopeOf(
  context: AudioContext,
  destination: AudioNode,
  gain: number,
  at: number,
  seconds: number,
): GainNode {
  const envelope = gainOf(context, SILENCE, destination)
  envelope.gain.setValueAtTime(SILENCE, at)
  envelope.gain.exponentialRampToValueAtTime(gain, at + ATTACK_SECONDS)
  envelope.gain.exponentialRampToValueAtTime(SILENCE, at + Math.max(seconds, ATTACK_SECONDS * 2))
  return envelope
}
