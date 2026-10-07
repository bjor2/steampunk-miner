import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from './eventNames'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'
import { createRunProgressSink } from './runProgress'

let nextSeq = 0

function line<N extends RunEventName>(event: N, data: RunEventData<N>, depthTiles = 0): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: nextSeq++,
    tick: nextSeq,
    timestamp: 0,
    runId: 'run_test',
    playerId: 'p1',
    planet: 1,
    depthTiles,
    event,
    data,
  } as RunEvent
}

describe('run progress', () => {
  it('starts a run at the surface with nothing mined or earned', () => {
    expect(createRunProgressSink().progress()).toEqual({
      maxDepthTiles: 0,
      tilesDestroyed: 0,
      mineralsCollected: 0,
      moneyTotal: '0e+0',
    })
  })

  it('counts the tiles destroyed, units collected and money earned as the live game logs them', () => {
    const sink = createRunProgressSink()
    sink.append(line('tile_destroyed', { tx: 3, ty: 290, kind: 'ground' }, 9))
    sink.append(line('tile_destroyed', { tx: 3, ty: 289, kind: 'ore' }, 10))
    sink.append(line('resource_collected', collected(1, 2, '6e+0'), 10))
    sink.append(line('resource_collected', collected(2, 1, '9e+0'), 10))
    sink.append(line('resource_sold', { items: [], value: '1.5e+1', mode: 'all', coinsShown: 3 }))
    sink.append(line('refine_collected', refinedBatch('4.5e+1')))
    expect(sink.progress()).toEqual({
      maxDepthTiles: 10,
      tilesDestroyed: 2,
      mineralsCollected: 3,
      moneyTotal: '6e+1',
    })
  })

  it('keeps the deepest tile reached after the vehicle climbs back up', () => {
    const sink = createRunProgressSink()
    sink.append(line('hint_shown', { hintId: 'hint_move' }, 40))
    sink.append(line('hint_shown', { hintId: 'hint_dock' }, 2))
    expect(sink.progress().maxDepthTiles).toBe(40)
  })
})

function refinedBatch(value: string): RunEventData<'refine_collected'> {
  return { slot: 0, tier: 3, units: 4, rawValue: '3e+1', value, waitSeconds: 60, queuedPlanet: 1 }
}

function collected(
  tier: number,
  amount: number,
  value: string,
): RunEventData<'resource_collected'> {
  return {
    resourceTier: tier,
    amount,
    value,
    oreId: 'kernel.metal.t1',
    oreDepthTiles: 10,
    chunk: '0,9',
  }
}
