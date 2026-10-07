/**
 * Plays the slices' sound cues within their voice budgets (#180 section 5; K-b ticket 227): each
 * request sounds through `SoundOut`, and a cue already at its budget first fades its oldest voice
 * over `CUE_VOICE_STEAL_FADE_SECONDS`. Owned by the sound stage, which advances its clock each
 * frame; nothing else plays a cue.
 */
import { CUE_VOICE_STEAL_FADE_SECONDS } from '../constants/audio'
import type { CueVoice, SoundOut } from '../shell/soundOut'
import type { SoundCueRequest } from '../store/soundCueRequests'
import {
  addSoundingVoice,
  createVoicePool,
  releaseRungOutVoices,
  soundingCountOf,
  takeVoiceToSteal,
  type VoicePool,
} from '../systems/audio/voicePool'
import { soundCueById, type SoundCue } from '../systems/registries/soundCues'

export interface SoundCuePlayer {
  play(request: SoundCueRequest): void
  /** Moves the player's clock on by a frame's seconds and frees the voices that rang out. */
  advance(seconds: number): void
  soundingCountOf(cueId: string): number
}

interface PlayerState {
  sound: SoundOut
  pool: VoicePool<CueVoice>
  now: number
}

export function createSoundCuePlayer(sound: SoundOut): SoundCuePlayer {
  const player: PlayerState = { sound, pool: createVoicePool(), now: 0 }
  return {
    play: (request) => playWithinBudget(player, request),
    advance: (seconds) => advanceClock(player, seconds),
    soundingCountOf: (cueId) => soundingCountOf(player.pool, cueId),
  }
}

function playWithinBudget(player: PlayerState, request: SoundCueRequest): void {
  const cue = soundCueById(request.cueId)
  if (cue === null) return
  stealOldestAtBudget(player, cue)
  const voice = player.sound.playCueTone(cue.tone, request)
  if (voice !== null) keepSounding(player, cue, voice)
}

function stealOldestAtBudget(player: PlayerState, cue: SoundCue): void {
  takeVoiceToSteal(player.pool, cue.id, cue.voices)?.fadeOut(CUE_VOICE_STEAL_FADE_SECONDS)
}

function keepSounding(player: PlayerState, cue: SoundCue, voice: CueVoice): void {
  const { now } = player
  addSoundingVoice(player.pool, {
    cueId: cue.id,
    startedAt: now,
    endsAt: now + cue.tone.seconds,
    voice,
  })
}

function advanceClock(player: PlayerState, seconds: number): void {
  player.now += seconds
  releaseRungOutVoices(player.pool, player.now)
}
