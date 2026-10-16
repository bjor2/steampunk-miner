import { describe, expect, it } from 'vitest'
import { deviceNoticesOf, RECONNECTING_TEXT, TAP_FOR_SOUND_TEXT } from './deviceNotices'
import { uiTextProblemsOf } from './uiTextBudget'
import { elementLinesOf } from './uiText'

// Ticket 478 (#470 P1-7): the stage's chips for a lost picture and a silent audio context.

describe('device notices', () => {
  it('shows nothing while the picture is live and sound plays', () => {
    expect(deviceNoticesOf({ isRenderContextLost: false, soundUnlock: 'sounding' })).toEqual([])
  })

  it('shows nothing before the first gesture', () => {
    expect(deviceNoticesOf({ isRenderContextLost: false, soundUnlock: 'awaitingGesture' })).toEqual(
      [],
    )
  })

  it('shows Reconnecting while the canvas has lost its context', () => {
    expect(deviceNoticesOf({ isRenderContextLost: true, soundUnlock: 'sounding' })).toEqual([
      RECONNECTING_TEXT,
    ])
  })

  it('shows Tap for sound while the audio context stays suspended', () => {
    expect(deviceNoticesOf({ isRenderContextLost: false, soundUnlock: 'suspended' })).toEqual([
      TAP_FOR_SOUND_TEXT,
    ])
  })

  it('puts Reconnecting before Tap for sound when both are missing', () => {
    const notices = deviceNoticesOf({ isRenderContextLost: true, soundUnlock: 'suspended' })
    expect(notices.map((notice) => notice.id)).toEqual([
      RECONNECTING_TEXT.id,
      TAP_FOR_SOUND_TEXT.id,
    ])
  })

  it('keeps both texts inside the Title+OneLine budget', () => {
    for (const text of [RECONNECTING_TEXT, TAP_FOR_SOUND_TEXT])
      expect(uiTextProblemsOf({ ...text, lines: elementLinesOf(text, [], null) })).toEqual([])
  })
})
