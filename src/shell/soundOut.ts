/**
 * The game's one way to make sound (#13 audio direction): the browser's Web Audio API behind a
 * small interface, so the scene only says what to play. Every sound is synthesised here, a
 * programmatic placeholder until the commissioned sounds and music land (#13 sourcing table).
 *
 * Browsers (and Electron's Chromium) start audio only after a user gesture, so the graph is built
 * on the first gesture of the unlock list; until then every call is silently dropped, never
 * queued. Every later gesture, and the page coming back into view, resumes a context that is not
 * running, since iOS suspends it after an interruption (#470 P1-7, ticket 478); each try is
 * reported, so the stage can ask for a tap while it stays suspended.
 */
import type { StingerId } from '../systems/audio/musicBook'
import type { MusicLayers } from '../systems/audio/musicLayers'
import {
  AUDIO_UNLOCK_EVENTS,
  isResumeNeeded,
  soundUnlockOf,
  type SoundUnlock,
} from '../systems/audio/soundUnlock'
import type { CueTone, SoundCuePlay } from '../systems/registries/soundCues'
import { createWebAudioGraph, type WebAudioGraph } from './webAudioGraph'

export type ClankWeight = 'light' | 'heavy'
export type StingerKind = 'core' | 'travel'

/** One sounding voice of a slice's cue, which the voice budget may fade out early. */
export interface CueVoice {
  fadeOut(seconds: number): void
}

export interface SoundOut {
  playChime(frequency: number): void
  playClank(weight: ClankWeight): void
  playThud(): void
  /** A casing ring laid behind the drill (#41 feel). */
  playCasingHiss(): void
  /** The drill broke through lining (#41 feel). */
  playCasingPop(): void
  /** A block's collapse warning: a low rumble rising over its 1 s (#43). */
  playCollapseRumble(): void
  /** The block refills: rock slumping in (#43). */
  playCollapseCrash(): void
  /** A tunnel wrecker breached a ring of the route: a rasping scrape (#111 telegraph). */
  playWreckerScrape(): void
  playStinger(kind: StingerKind, tuningSemitones: number): void
  setDrill(frequency: number, gain: number): void
  setEngine(puffsPerSecond: number, gain: number): void
  setSteam(gain: number): void
  /** The layers' levels, the planet's tuning and the bus level (volume, mute, artefact duck). */
  setMusic(layers: MusicLayers, tuningSemitones: number, busGain: number): void
  /** One of the #49 music stingers; the layers duck for its length. */
  playMusicStinger(stingerId: StingerId, tuningSemitones: number): void
  /** A slice's sound cue (#180), or null while audio waits for the first gesture. */
  playCueTone(tone: CueTone, play: SoundCuePlay): CueVoice | null
}

let graph: WebAudioGraph | null = null
let isWaitingForGesture = false
const unlockFollowers = new Set<(unlock: SoundUnlock) => void>()

/** The one sound output; silent until the first gesture builds the graph. */
export function getSoundOut(): SoundOut {
  waitForGesture()
  return SOUND_OUT
}

const SOUND_OUT: SoundOut = {
  playChime: (frequency) => graph?.playChime(frequency),
  playClank: (weight) => graph?.playClank(weight),
  playThud: () => graph?.playThud(),
  playCasingHiss: () => graph?.playCasingHiss(),
  playCasingPop: () => graph?.playCasingPop(),
  playCollapseRumble: () => graph?.playCollapseRumble(),
  playCollapseCrash: () => graph?.playCollapseCrash(),
  playWreckerScrape: () => graph?.playWreckerScrape(),
  playStinger: (kind, tuning) => graph?.playStinger(kind, tuning),
  setDrill: (frequency, gain) => graph?.setDrill(frequency, gain),
  setEngine: (puffs, gain) => graph?.setEngine(puffs, gain),
  setSteam: (gain) => graph?.setSteam(gain),
  setMusic: (layers, tuning, busGain) => graph?.setMusic(layers, tuning, busGain),
  playMusicStinger: (stingerId, tuning) => graph?.playMusicStinger(stingerId, tuning),
  playCueTone: (tone, play) => graph?.playCueTone(tone, play) ?? null,
}

/** Each report of whether sound plays, from the first gesture on; the returned call stops them. */
export function onSoundUnlockChange(follow: (unlock: SoundUnlock) => void): () => void {
  unlockFollowers.add(follow)
  return () => unlockFollowers.delete(follow)
}

/** A browser with no Web Audio stays silent and never asks for a tap. */
function waitForGesture(): void {
  if (isWaitingForGesture || typeof window === 'undefined' || !('AudioContext' in window)) return
  isWaitingForGesture = true
  // Kept for the page's life, not once: a gesture after an interruption resumes the context.
  AUDIO_UNLOCK_EVENTS.forEach((name) =>
    window.addEventListener(name, unlockAudio, { passive: true }),
  )
  document.addEventListener('visibilitychange', resumeOnPageShown)
}

function unlockAudio(): void {
  graph ??= createReportingGraph()
  resumeAudio(graph)
}

function createReportingGraph(): WebAudioGraph {
  const created = createWebAudioGraph(new AudioContext())
  created.context.addEventListener('statechange', reportSoundUnlock)
  return created
}

/** Outside a gesture iOS may refuse it; the report then asks for a tap. */
function resumeOnPageShown(): void {
  if (graph !== null && document.visibilityState === 'visible') resumeAudio(graph)
}

/** A refused resume is reported, not thrown: the context stays suspended until the next try. */
function resumeAudio(audio: WebAudioGraph): void {
  if (!isResumeNeeded(audio.context.state)) return
  void audio.context.resume().then(reportSoundUnlock, reportSoundUnlock)
}

function reportSoundUnlock(): void {
  const unlock = soundUnlockOf(graph?.context.state ?? null)
  unlockFollowers.forEach((follow) => follow(unlock))
}
