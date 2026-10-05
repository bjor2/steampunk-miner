/**
 * The synthesised placeholder sounds (#13: "synthesised in the browser audio engine"): three
 * loops (drill, engine chug, steam hiss), the music's step sequencer (#49) and the one-shots
 * (chime, clank, thud, stingers), all from oscillators and one noise buffer. Built once per audio
 * context; the sound loops run from the start and are only ever re-levelled, so a frame never
 * builds a node for them, and a level that has not moved is not rescheduled.
 */
import { MUSIC_BOOK } from '../systems/audio/musicBook'
import { gainOf, glide, SILENCE } from './audioNodes'
import { createMusicSequencer } from './musicSequencer'
import type { ClankWeight, SoundOut, StingerKind } from './soundOut'

export type WebAudioGraph = SoundOut & { context: AudioContext }

interface Loop {
  oscillator: OscillatorNode
  out: GainNode
}

const MASTER_GAIN = 0.5

export function createWebAudioGraph(context: AudioContext): WebAudioGraph {
  const master = gainOf(context, MASTER_GAIN, context.destination)
  const noise = createNoiseBuffer(context)
  const drill = createDrillLoop(context, master)
  const engine = createEngineLoop(context, master)
  const steam = createSteamLoop(context, master, noise)
  const music = createMusicSequencer(context, master, noise, MUSIC_BOOK)
  return {
    context,
    playChime: (frequency) => playChime(context, master, frequency),
    playClank: (weight) => playClank(context, master, noise, weight),
    playThud: () => playThud(context, master),
    playStinger: (kind, tuning) => playStinger(context, master, kind, tuning),
    setDrill: (frequency, gain) => levelLoop(context, drill, frequency, gain),
    setEngine: (puffs, gain) => levelLoop(context, engine, puffs, gain),
    setSteam: (gain) => glide(context, steam.gain, gain),
    setMusic: (layers, tuning, busGain) => music.setMusic(layers, tuning, busGain),
    playMusicStinger: (stingerId, tuning) => music.playStinger(stingerId, tuning),
  }
}

function levelLoop(context: AudioContext, loop: Loop, frequency: number, gain: number): void {
  glide(context, loop.oscillator.frequency, frequency)
  glide(context, loop.out.gain, gain)
}

/** One second of white noise, looped by the hiss and cut short by the clanks. */
function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let at = 0; at < samples.length; at++) samples[at] = Math.random() * 2 - 1
  return buffer
}

/** A sawtooth motor through a low-pass, so it growls rather than buzzes. */
function createDrillLoop(context: AudioContext, master: GainNode): Loop {
  const out = gainOf(context, 0, master)
  const filter = new BiquadFilterNode(context, { type: 'lowpass', frequency: 900 })
  filter.connect(out)
  const oscillator = new OscillatorNode(context, { type: 'sawtooth', frequency: 200 })
  oscillator.connect(filter)
  oscillator.start()
  return { oscillator, out }
}

/** A low square chopped on and off by a square LFO: the LFO's frequency is the chug rate. */
function createEngineLoop(context: AudioContext, master: GainNode): Loop {
  const out = gainOf(context, 0, master)
  const chop = new GainNode(context, { gain: 0.5 })
  chop.connect(out)
  const body = new OscillatorNode(context, { type: 'square', frequency: 48 })
  body.connect(chop)
  const oscillator = new OscillatorNode(context, { type: 'square', frequency: 2 })
  const depth = new GainNode(context, { gain: 0.5 })
  depth.connect(chop.gain)
  oscillator.connect(depth)
  body.start()
  oscillator.start()
  return { oscillator, out }
}

function createSteamLoop(context: AudioContext, master: GainNode, noise: AudioBuffer): GainNode {
  const out = gainOf(context, 0, master)
  const filter = new BiquadFilterNode(context, { type: 'highpass', frequency: 2500 })
  filter.connect(out)
  const source = new AudioBufferSourceNode(context, { buffer: noise, loop: true })
  source.connect(filter)
  source.start()
  return out
}

/** A note that strikes and rings out, stopping itself when silent. */
function strike(
  context: AudioContext,
  master: GainNode,
  note: { type: OscillatorType; frequency: number; gain: number; seconds: number; at?: number },
): OscillatorNode {
  const start = context.currentTime + (note.at ?? 0)
  const envelope = gainOf(context, SILENCE, master)
  envelope.gain.setValueAtTime(SILENCE, start)
  envelope.gain.exponentialRampToValueAtTime(note.gain, start + 0.005)
  envelope.gain.exponentialRampToValueAtTime(SILENCE, start + note.seconds)
  const oscillator = new OscillatorNode(context, { type: note.type, frequency: note.frequency })
  oscillator.connect(envelope)
  oscillator.start(start)
  oscillator.stop(start + note.seconds)
  return oscillator
}

function playChime(context: AudioContext, master: GainNode, frequency: number): void {
  strike(context, master, { type: 'sine', frequency, gain: 0.3, seconds: 0.7 })
  strike(context, master, { type: 'sine', frequency: frequency * 2, gain: 0.08, seconds: 0.4 })
}

function playClank(
  context: AudioContext,
  master: GainNode,
  noise: AudioBuffer,
  weight: ClankWeight,
): void {
  const isHeavy = weight === 'heavy'
  strike(context, master, {
    type: 'square',
    frequency: isHeavy ? 70 : 140,
    gain: 0.22,
    seconds: 0.35,
  })
  const ring = gainOf(context, 0.4, master)
  ring.gain.exponentialRampToValueAtTime(SILENCE, context.currentTime + 0.22)
  const filter = new BiquadFilterNode(context, {
    type: 'bandpass',
    frequency: isHeavy ? 500 : 1200,
    Q: 4,
  })
  filter.connect(ring)
  const burst = new AudioBufferSourceNode(context, { buffer: noise })
  burst.connect(filter)
  burst.start(context.currentTime, 0, 0.22)
}

function playThud(context: AudioContext, master: GainNode): void {
  const thud = strike(context, master, { type: 'sine', frequency: 70, gain: 0.5, seconds: 0.3 })
  thud.frequency.exponentialRampToValueAtTime(38, context.currentTime + 0.3)
}

/** Core: a rising brass arpeggio. Travel: a long falling glide, the platform lifting off. */
function playStinger(
  context: AudioContext,
  master: GainNode,
  kind: StingerKind,
  tuning: number,
): void {
  const root = 440 * 2 ** (tuning / 12)
  if (kind === 'core') playCoreStinger(context, master, root)
  else playTravelStinger(context, master, root)
}

function playCoreStinger(context: AudioContext, master: GainNode, root: number): void {
  ;[0, 4, 7, 12].forEach((semitones, step) =>
    strike(context, master, {
      type: 'triangle',
      frequency: root * 2 ** (semitones / 12),
      gain: 0.22,
      seconds: 0.6,
      at: step * 0.14,
    }),
  )
}

function playTravelStinger(context: AudioContext, master: GainNode, root: number): void {
  const fall = strike(context, master, {
    type: 'sawtooth',
    frequency: root / 2,
    gain: 0.15,
    seconds: 1.4,
  })
  fall.frequency.exponentialRampToValueAtTime(root / 4, context.currentTime + 1.4)
}
