import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { soundCueById, type SoundCue } from './soundCues'

const RATCHET: SoundCue = {
  id: 'cue-probe.ratchet',
  voices: 4,
  tone: { partials: [{ wave: 'square', frequency: 660, gain: 0.2 }], noise: null, seconds: 0.12 },
}

const sliceWith = (cue: SoundCue): SliceDefinition => ({
  id: 'cue-probe',
  register: (r) => r.soundCue(cue),
})

describe('sound cues', () => {
  it('finds a registered cue by its id, and nothing for an id nobody registered', () => {
    withRegistrations([sliceWith(RATCHET)], () => {
      expect(soundCueById('cue-probe.ratchet')).toBe(RATCHET)
      expect(soundCueById('cue-probe.whistle')).toBeNull()
    })
  })

  it('refuses at the seal a cue with no whole voice budget or a silent tone', () => {
    const noVoices = { ...RATCHET, voices: 0.5 }
    const silent = { ...RATCHET, tone: { ...RATCHET.tone, partials: [] } }
    expect(() => withRegistrations([sliceWith(noVoices)], () => null)).toThrow(
      /"cue-probe.ratchet": its voices are a whole number from 1/,
    )
    expect(() => withRegistrations([sliceWith(silent)], () => null)).toThrow(
      /its tone has no partial and no noise/,
    )
  })
})
