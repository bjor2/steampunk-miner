/**
 * The voice budget of slice sound cues (#180 section 5: "≤4 ratchet voices, with a 5th stealing the
 * oldest", plus 1 flourish voice): which voices of each cue still ring, and which one to steal
 * when a cue already sounds at its budget. Generic over the voice handle the audio engine gives
 * back, so the rule runs with no audio at all. Time is passed in, in seconds.
 */

export interface SoundingVoice<V> {
  cueId: string
  startedAt: number
  endsAt: number
  voice: V
}

export interface VoicePool<V> {
  sounding: SoundingVoice<V>[]
}

export function createVoicePool<V>(): VoicePool<V> {
  return { sounding: [] }
}

/** Forgets the voices that have rung out by `now`, in place. */
export function releaseRungOutVoices<V>(pool: VoicePool<V>, now: number): void {
  let kept = 0
  for (const voice of pool.sounding) if (voice.endsAt > now) pool.sounding[kept++] = voice
  pool.sounding.length = kept
}

/**
 * Before a new voice of `cueId` sounds: with `budget` of its voices already ringing, takes the
 * oldest out of the pool and returns it to fade; with room, returns null.
 */
export function takeVoiceToSteal<V>(pool: VoicePool<V>, cueId: string, budget: number): V | null {
  if (soundingCountOf(pool, cueId) < budget) return null
  const oldest = oldestVoiceAt(pool, cueId)
  return pool.sounding.splice(oldest, 1)[0].voice
}

export function addSoundingVoice<V>(pool: VoicePool<V>, sounding: SoundingVoice<V>): void {
  pool.sounding.push(sounding)
}

export function soundingCountOf<V>(pool: VoicePool<V>, cueId: string): number {
  let count = 0
  for (const voice of pool.sounding) if (voice.cueId === cueId) count++
  return count
}

function oldestVoiceAt<V>(pool: VoicePool<V>, cueId: string): number {
  let oldest = -1
  pool.sounding.forEach((voice, at) => {
    if (voice.cueId !== cueId) return
    if (oldest < 0 || voice.startedAt < pool.sounding[oldest].startedAt) oldest = at
  })
  return oldest
}
