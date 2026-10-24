import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore, useGameStore } from './gameStore'

// Ticket 792: the star map's first-time hint is up until the player opens the map, which the map's
// own action tells the hint board at once, so the plaque never outlives its button's first press.

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

describe('star map hint (ticket 792)', () => {
  it('takes the star map hint down the moment the star map opens', () => {
    game().startPlaques()
    game().debugShowHint('hint_star_map')
    expect(game().hintBoard.shown?.id).toBe('hint_star_map')
    game().toggleStarMap()
    expect(game().isStarMapOpen).toBe(true)
    expect(game().hintBoard.shown).toBeNull()
  })

  it('keeps the hint up while the map stays shut', () => {
    game().startPlaques()
    game().debugShowHint('hint_star_map')
    game().observePlaques([])
    expect(game().hintBoard.shown?.id).toBe('hint_star_map')
  })
})
