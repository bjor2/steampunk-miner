import { describe, expect, it } from 'vitest'
import {
  AUDIO_UNLOCK_EVENTS,
  isResumeNeeded,
  isTapForSoundShown,
  soundUnlockOf,
  type SoundContextState,
} from './soundUnlock'

// Ticket 478 (#470 P1-7): which gestures start the sound, and when the player is asked to tap.

const STATES: readonly SoundContextState[] = ['suspended', 'running', 'closed', 'interrupted']

describe('sound unlock: gestures', () => {
  it('tries on a key, a pointer press, a touch end and a click', () => {
    expect([...AUDIO_UNLOCK_EVENTS]).toEqual(['keydown', 'pointerdown', 'touchend', 'click'])
  })

  it('takes the touch end and the click iOS Safari counts as gestures, not only a press', () => {
    expect(AUDIO_UNLOCK_EVENTS).toContain('touchend')
    expect(AUDIO_UNLOCK_EVENTS).toContain('click')
  })
})

describe('sound unlock: state', () => {
  it('waits for a gesture while no context is built', () => {
    expect(soundUnlockOf(null)).toBe('awaitingGesture')
  })

  it('sounds once the context runs', () => {
    expect(soundUnlockOf('running')).toBe('sounding')
  })

  it('reads a suspended or an interrupted context as suspended', () => {
    expect(soundUnlockOf('suspended')).toBe('suspended')
    expect(soundUnlockOf('interrupted')).toBe('suspended')
  })

  it('resumes only a suspended or interrupted context', () => {
    expect(STATES.filter(isResumeNeeded)).toEqual(['suspended', 'interrupted'])
  })
})

describe('sound unlock: tap for sound chip', () => {
  it('shows only while a try left the context suspended', () => {
    const shown = [null, ...STATES].filter((state) => isTapForSoundShown(soundUnlockOf(state)))
    expect(shown).toEqual(['suspended', 'interrupted'])
  })

  it('never shows before the first gesture, when every browser is still silent', () => {
    expect(isTapForSoundShown('awaitingGesture')).toBe(false)
  })
})
