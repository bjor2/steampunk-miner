/**
 * The game's one way to make sound (#13 audio direction): the browser's Web Audio API behind a
 * small interface, so the scene only says what to play. Every sound is synthesised here, a
 * programmatic placeholder until the commissioned sounds and music land (#13 sourcing table).
 *
 * Browsers (and Electron's Chromium) start audio only after a user gesture, so the graph is built
 * on the first key or pointer press; until then every call is silently dropped, never queued.
 */
import type { StingerId } from '../systems/audio/musicBook'
import type { MusicLayers } from '../systems/audio/musicLayers'
import { createWebAudioGraph, type WebAudioGraph } from './webAudioGraph'

export type ClankWeight = 'light' | 'heavy'
export type StingerKind = 'core' | 'travel'

export interface SoundOut {
  playChime(frequency: number): void
  playClank(weight: ClankWeight): void
  playThud(): void
  playStinger(kind: StingerKind, tuningSemitones: number): void
  setDrill(frequency: number, gain: number): void
  setEngine(puffsPerSecond: number, gain: number): void
  setSteam(gain: number): void
  /** The layers' levels, the planet's tuning and the bus level (volume, mute, artefact duck). */
  setMusic(layers: MusicLayers, tuningSemitones: number, busGain: number): void
  /** One of the #49 music stingers; the layers duck for its length. */
  playMusicStinger(stingerId: StingerId, tuningSemitones: number): void
}

const UNLOCK_EVENTS = ['keydown', 'pointerdown'] as const

let graph: WebAudioGraph | null = null
let isWaitingForGesture = false

/** The one sound output; silent until the first gesture builds the graph. */
export function getSoundOut(): SoundOut {
  waitForGesture()
  return SOUND_OUT
}

const SOUND_OUT: SoundOut = {
  playChime: (frequency) => graph?.playChime(frequency),
  playClank: (weight) => graph?.playClank(weight),
  playThud: () => graph?.playThud(),
  playStinger: (kind, tuning) => graph?.playStinger(kind, tuning),
  setDrill: (frequency, gain) => graph?.setDrill(frequency, gain),
  setEngine: (puffs, gain) => graph?.setEngine(puffs, gain),
  setSteam: (gain) => graph?.setSteam(gain),
  setMusic: (layers, tuning, busGain) => graph?.setMusic(layers, tuning, busGain),
  playMusicStinger: (stingerId, tuning) => graph?.playMusicStinger(stingerId, tuning),
}

function waitForGesture(): void {
  if (isWaitingForGesture || typeof window === 'undefined' || !('AudioContext' in window)) return
  isWaitingForGesture = true
  UNLOCK_EVENTS.forEach((name) => window.addEventListener(name, unlockAudio, { once: true }))
}

function unlockAudio(): void {
  UNLOCK_EVENTS.forEach((name) => window.removeEventListener(name, unlockAudio))
  if (graph !== null) return
  graph = createWebAudioGraph(new AudioContext())
  void graph.context.resume().catch(() => {})
}
