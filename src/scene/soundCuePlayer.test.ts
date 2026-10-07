import { afterEach, describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import type { CueVoice, SoundOut } from '../shell/soundOut'
import { listenForSoundCues, requestSoundCue } from '../store/soundCueRequests'
import type { CueTone, SoundCuePlay } from '../systems/registries/soundCues'
import { createSoundCuePlayer } from './soundCuePlayer'

// The `soundCues` seam (K-b ticket 227, #180 escalating audio): a fake slice registers a ratchet
// with #180's budget of 4 and a flourish with 1; requests reach SoundOut within the budget.

const RATCHET_TONE: CueTone = {
  partials: [{ wave: 'square', frequency: 660, gain: 0.2 }],
  noise: { frequency: 3000, q: 4, gain: 0.1 },
  seconds: 0.6,
}

const audioSlice: SliceDefinition = {
  id: 'cue-probe',
  register(r) {
    r.soundCue({ id: 'cue-probe.ratchet', voices: 4, tone: RATCHET_TONE })
    r.soundCue({ id: 'cue-probe.flourish', voices: 1, tone: { ...RATCHET_TONE, seconds: 1.2 } })
  },
}

interface Played {
  tone: CueTone
  play: SoundCuePlay
  fadedOverSeconds: number | null
}

/** A SoundOut that records each cue it plays and each fade the budget asks for. */
function recordingSoundOut(played: Played[]): SoundOut {
  const playCueTone = (tone: CueTone, play: SoundCuePlay): CueVoice => {
    const entry: Played = { tone, play, fadedOverSeconds: null }
    played.push(entry)
    return { fadeOut: (seconds) => (entry.fadedOverSeconds = seconds) }
  }
  return { playCueTone } as unknown as SoundOut
}

let stopListening = () => {}

afterEach(() => stopListening())

describe('sound cue player', () => {
  it("plays a slice's cue through SoundOut at the pitch and level the slice asked for", () => {
    const played: Played[] = []
    withRegistrations([audioSlice], () => {
      stopListening = listenForSoundCues(createSoundCuePlayer(recordingSoundOut(played)).play)
      requestSoundCue('cue-probe.ratchet', { pitchSemitones: 7 })
    })
    expect(played).toHaveLength(1)
    expect(played[0].tone).toBe(RATCHET_TONE)
    expect(played[0].play).toMatchObject({ pitchSemitones: 7, gain: 1 })
  })

  it('keeps a 50-buy spree at the cap within 4 ratchet voices and 1 flourish voice', () => {
    const played: Played[] = []
    withRegistrations([audioSlice], () => {
      const player = createSoundCuePlayer(recordingSoundOut(played))
      for (let buy = 0; buy < 50; buy++) {
        player.play({ cueId: 'cue-probe.ratchet', pitchSemitones: buy % 5, gain: 1 })
        if (buy % 10 === 9) player.play({ cueId: 'cue-probe.flourish', pitchSemitones: 0, gain: 1 })
        expect(player.soundingCountOf('cue-probe.ratchet')).toBeLessThanOrEqual(4)
        expect(player.soundingCountOf('cue-probe.flourish')).toBeLessThanOrEqual(1)
        player.advance(6 / 60)
      }
    })
    expect(played.filter((entry) => entry.fadedOverSeconds === 0.015).length).toBeGreaterThan(0)
  })

  it('fades the oldest ratchet over 15 ms when a fifth starts while four still ring', () => {
    const played: Played[] = []
    withRegistrations([audioSlice], () => {
      const player = createSoundCuePlayer(recordingSoundOut(played))
      for (let buy = 0; buy < 5; buy++) {
        player.play({ cueId: 'cue-probe.ratchet', pitchSemitones: buy, gain: 1 })
        player.advance(0.1)
      }
    })
    expect(played.map((entry) => entry.fadedOverSeconds)).toEqual([0.015, null, null, null, null])
  })

  it('refuses a cue id no slice registered', () => {
    withRegistrations([audioSlice], () => {
      expect(() => requestSoundCue('cue-probe.whistle')).toThrow(
        'no slice registered the sound cue "cue-probe.whistle"',
      )
    })
  })
})
