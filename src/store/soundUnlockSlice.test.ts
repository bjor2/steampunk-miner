import { beforeEach, describe, expect, it } from 'vitest'
import { deviceNoticesOf, TAP_FOR_SOUND_TEXT } from '../systems/views/deviceNotices'
import { resetGameStore, takeSessionSnapshot, useGameStore } from './gameStore'

// Ticket 478 (#470 P1-7): the sound output's reports drive the stage's "tap for sound" chip.

beforeEach(() => resetGameStore())

const game = () => useGameStore.getState()
const noticeIds = () => deviceNoticesOf(game()).map((notice) => notice.id)

describe('sound unlock slice', () => {
  it('starts waiting for a gesture, with no chip', () => {
    expect(game().soundUnlock).toBe('awaitingGesture')
    expect(noticeIds()).toEqual([])
  })

  it('shows Tap for sound once a try left the context suspended', () => {
    game().noteSoundUnlock('suspended')
    expect(noticeIds()).toEqual([TAP_FOR_SOUND_TEXT.id])
  })

  it('takes the chip away once the context runs', () => {
    game().noteSoundUnlock('suspended')
    game().noteSoundUnlock('sounding')
    expect(noticeIds()).toEqual([])
  })

  it('never changes the session or its digest', () => {
    const before = takeSessionSnapshot()
    game().noteSoundUnlock('suspended')
    expect(takeSessionSnapshot()).toEqual(before)
  })
})
