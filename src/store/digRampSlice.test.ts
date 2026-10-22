import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { resetGameStore, useGameStore } from './gameStore'

// The dig ramp slice (Bjor's ruling on #724): the motion rule's "the gravity ramp holds the cut
// down" answer, kept for the HUD's tint and the one-time hint.

beforeEach(() => {
  resetGameStore()
  installRunLog(
    createRunLog({ runId: 'run_test', sink: createMemorySink(), secondsSinceStart: () => 0 }),
  )
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

describe('dig ramp slice (#724)', () => {
  it('starts with no dig held by gravity, and keeps what the motion rule last said', () => {
    expect(game().isDigGravityLimited).toBe(false)
    game().noteDigGravityLimit(true)
    expect(game().isDigGravityLimited).toBe(true)
    game().noteDigGravityLimit(false)
    expect(game().isDigGravityLimited).toBe(false)
  })

  it('leaves the store alone on a step that keeps the answer', () => {
    let writes = 0
    const unsubscribe = useGameStore.subscribe(() => (writes += 1))
    game().noteDigGravityLimit(false)
    game().noteDigGravityLimit(true)
    game().noteDigGravityLimit(true)
    unsubscribe()
    expect(writes).toBe(1)
  })

  it('queues the gravity ramp hint the first time a dig is held, once the boards watch', () => {
    game().startPlaques()
    game().noteDigGravityLimit(true)
    const { hintBoard } = game()
    const ids = [hintBoard.shown?.id, ...hintBoard.queued.map((hint) => hint.id)]
    expect(ids).toContain('hint_gravity_ramp')
  })
})
