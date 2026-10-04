import { describe, expect, it } from 'vitest'
import { createMemorySink } from './eventSink'
import { createRunLog } from './runLog'
import type { RunEventContext } from './runEvent'

const context: RunEventContext = {
  playerId: 'player_1',
  planet: 17,
  planetSeed: 83921,
  depth: 0.73,
}

function startRun(clock: { now: number } = { now: 0 }) {
  const sink = createMemorySink()
  const runLog = createRunLog({
    runId: 'run_test',
    sink,
    secondsSinceStart: () => clock.now,
  })
  return { runLog, sink, clock }
}

describe('run log', () => {
  it('stamps the event with run, place and time as the design doc example does', () => {
    const { runLog, sink, clock } = startRun()
    clock.now = 1023.52
    runLog.record(context, 'resource_collected', { resourceTier: 42, amount: 6, value: 1250000 })
    expect(sink.events).toEqual([
      {
        seq: 0,
        timestamp: 1023.52,
        runId: 'run_test',
        playerId: 'player_1',
        planet: 17,
        planetSeed: 83921,
        depth: 0.73,
        event: 'resource_collected',
        data: { resourceTier: 42, amount: 6, value: 1250000 },
      },
    ])
  })

  it('numbers events in the order they were recorded, even at equal timestamps', () => {
    const { runLog, sink } = startRun()
    runLog.record(context, 'quest_started', { id: 'a' })
    runLog.record(context, 'quest_completed', { id: 'a' })
    expect(sink.events.map((event) => event.seq)).toEqual([0, 1])
  })

  it('keeps events already recorded unchanged when the world moves on', () => {
    const { runLog, sink } = startRun()
    const moving = { ...context }
    runLog.record(moving, 'depth_milestone_reached', { depth: 0.73 })
    moving.depth = 0.99
    expect(sink.events[0].depth).toBe(0.73)
  })
})
