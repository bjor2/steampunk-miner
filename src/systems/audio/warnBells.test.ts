import { describe, expect, it } from 'vitest'
import { soundCueById, soundCueProblems } from '../registries/soundCues'
import { DESIGN_TOKENS } from '../views/designSystem'
import { DUCKED_SHARE } from './musicLayers'
import { WARN_BELL_CUES, warnBellGainOf } from './warnBells'

// Ticket 685 (design section 8): the ladder's bells are the kernel's ui.warn.* cues, the bell
// family descending in pitch, one voice each and ringing as long as the token says.

const tokenOf = (id: string) => DESIGN_TOKENS.soundCues.find((cue) => cue.id === id)

describe('warning bells (ticket 685)', () => {
  it('rings one bell per ladder tier under its ui.warn id', () => {
    expect(WARN_BELL_CUES.map((cue) => cue.id)).toEqual([
      'ui.warn.low',
      'ui.warn.critical',
      'ui.warn.empty',
    ])
  })

  it('takes each bell its voices and length from the tokens, a bell-family cue', () => {
    for (const cue of WARN_BELL_CUES) {
      const token = tokenOf(cue.id)
      expect(token?.family).toBe('bell')
      expect(cue.voices).toBe(token?.voices)
      expect(cue.tone.seconds * 1000).toBe(token?.maxMs)
    }
  })

  it('descends in pitch from low to critical to empty', () => {
    const pitches = WARN_BELL_CUES.map((cue) => cue.tone.partials[0].frequency)
    expect([...pitches].sort((a, b) => b - a)).toEqual(pitches)
    expect(new Set(pitches).size).toBe(pitches.length)
  })

  it('is a sound cue that plays as registered and is found by id beside the slices', () => {
    expect(WARN_BELL_CUES.flatMap(soundCueProblems)).toEqual([])
    expect(soundCueById('ui.warn.critical')).toBe(WARN_BELL_CUES[1])
    expect(soundCueById('ui.warn.nowhere')).toBeNull()
  })

  it('ducks 6 dB under the drill, as the music does', () => {
    expect(warnBellGainOf(false)).toBe(1)
    expect(warnBellGainOf(true)).toBe(DUCKED_SHARE)
  })
})
