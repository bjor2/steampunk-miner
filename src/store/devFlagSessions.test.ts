import { beforeEach, describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS } from '../constants/devFlags'
import { flagsOf } from '../systems/authority/devFlagState'
import { readAuthorityState } from './authorityLink'
import { readAuthorityTick, resetGameStore, takeSessionSnapshot, useGameStore } from './gameStore'

// HS (e) on #547: a loaded world restores its own recorded flags, the world as it ran, and a New
// Game starts from the shipped defaults, never from an old session's delta or its taint.

const game = () => useGameStore.getState()

function setExactCarryOff(): void {
  const tick = readAuthorityTick() + 1
  const delta = { 'drill.exactCarry': false }
  game().fastForward(5, [{ tick, type: 'debug.setFlags', payload: { delta } }])
}

describe('dev flags across sessions (ticket 547)', () => {
  beforeEach(() => resetGameStore())

  it('restores a snapshot with the flags its world ran with', () => {
    setExactCarryOff()
    const snapshot = JSON.parse(JSON.stringify(takeSessionSnapshot()))
    resetGameStore()
    expect(flagsOf(readAuthorityState())).toBe(AUTHORITY_DEV_FLAGS)
    game().restoreSnapshot(snapshot)
    expect(flagsOf(readAuthorityState())['drill.exactCarry']).toBe(false)
    expect(readAuthorityState().devFlagsEverSet).toBe(true)
  })

  it('starts a New Game on the shipped flags with no taint, whatever the last world set', () => {
    setExactCarryOff()
    game().startNewGame()
    const fresh = readAuthorityState()
    expect(flagsOf(fresh)).toBe(AUTHORITY_DEV_FLAGS)
    expect('devFlagDelta' in fresh).toBe(false)
    expect('devFlagsEverSet' in fresh).toBe(false)
  })
})
