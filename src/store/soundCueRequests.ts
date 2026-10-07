/**
 * How a slice asks for one of its sound cues (#180; K-b ticket 227): `requestSoundCue` hands the
 * request to whoever plays sound, which is the scene's sound stage. A plain listener set, not store
 * state, because a sound is a moment, not something the UI renders; asking never changes state or
 * a digest. A cue id nobody registered throws, so a typo fails its spec instead of staying silent.
 */
import { soundCueById, type SoundCuePlay } from '../systems/registries/soundCues'

export interface SoundCueRequest extends SoundCuePlay {
  cueId: string
}

export type SoundCueListener = (request: SoundCueRequest) => void

/** As registered: no pitch shift, the tone's own level. */
const AS_REGISTERED: SoundCuePlay = { pitchSemitones: 0, gain: 1 }

const listeners = new Set<SoundCueListener>()

/** Returns the call that stops listening. */
export function listenForSoundCues(listener: SoundCueListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function requestSoundCue(cueId: string, play: Partial<SoundCuePlay> = {}): void {
  if (soundCueById(cueId) === null) throw new Error(`no slice registered the sound cue "${cueId}"`)
  const request: SoundCueRequest = { cueId, ...AS_REGISTERED, ...play }
  listeners.forEach((listener) => listener(request))
}
