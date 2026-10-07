import { describe, expect, it } from 'vitest'
import {
  addSoundingVoice,
  createVoicePool,
  releaseRungOutVoices,
  soundingCountOf,
  takeVoiceToSteal,
} from './voicePool'

function soundAt(pool: ReturnType<typeof createVoicePool<string>>, cueId: string, now: number) {
  const stolen = takeVoiceToSteal(pool, cueId, 4)
  addSoundingVoice(pool, { cueId, startedAt: now, endsAt: now + 0.6, voice: `${cueId}@${now}` })
  return stolen
}

describe('voice pool', () => {
  it('has room for a cue until its budget of voices rings at once', () => {
    const pool = createVoicePool<string>()
    const stolen = [0, 0.1, 0.2, 0.3].map((now) => soundAt(pool, 'ratchet', now))
    expect(stolen).toEqual([null, null, null, null])
    expect(soundingCountOf(pool, 'ratchet')).toBe(4)
  })

  it('steals the oldest voice of that cue for a fifth, and never another cue', () => {
    const pool = createVoicePool<string>()
    soundAt(pool, 'flourish', 0)
    ;[0.1, 0.2, 0.3, 0.4].forEach((now) => soundAt(pool, 'ratchet', now))
    expect(soundAt(pool, 'ratchet', 0.5)).toBe('ratchet@0.1')
    expect(soundingCountOf(pool, 'flourish')).toBe(1)
  })

  it('frees the voices that have rung out', () => {
    const pool = createVoicePool<string>()
    soundAt(pool, 'ratchet', 0)
    soundAt(pool, 'ratchet', 0.5)
    releaseRungOutVoices(pool, 0.6)
    expect(pool.sounding.map((voice) => voice.voice)).toEqual(['ratchet@0.5'])
  })
})
