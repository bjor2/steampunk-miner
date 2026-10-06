import { describe, expect, it } from 'vitest'
import { createMemorySink } from './eventSink'
import { createRunLog } from './runLog'
import { LOG_SCHEMA_VERSION, type RunEventStamp } from './runEvent'

const stamp: RunEventStamp = {
  playerId: 'player_1',
  planet: 17,
  depthTiles: 73,
  tick: 8120,
  cmd: [8118, 3],
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
  it('stamps the event with the versioned envelope of the logging contract', () => {
    const { runLog, sink, clock } = startRun()
    clock.now = 135.4
    runLog.record(stamp, 'resource_collected', { resourceTier: 42, amount: 6, value: '1.25e+6' })
    expect(sink.events).toEqual([
      {
        v: LOG_SCHEMA_VERSION,
        seq: 0,
        tick: 8120,
        timestamp: 135.4,
        runId: 'run_test',
        playerId: 'player_1',
        planet: 17,
        depthTiles: 73,
        event: 'resource_collected',
        cmd: [8118, 3],
        data: { resourceTier: 42, amount: 6, value: '1.25e+6' },
      },
    ])
  })

  it('numbers events in the order they were recorded, even at equal ticks', () => {
    const { runLog, sink } = startRun()
    runLog.record(stamp, 'storage_full', { lostUnits: 1 })
    runLog.record(stamp, 'storage_full', { lostUnits: 2 })
    expect(sink.events.map((event) => event.seq)).toEqual([0, 1])
  })

  it('keeps events already recorded unchanged when the world moves on', () => {
    const { runLog, sink } = startRun()
    const moving = { ...stamp }
    runLog.record(moving, 'depth_band_entered', { band: 2 })
    moving.depthTiles = 99
    expect(sink.events[0].depthTiles).toBe(73)
  })
})
