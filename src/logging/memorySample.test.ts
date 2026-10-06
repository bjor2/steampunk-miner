import { describe, expect, it } from 'vitest'
import type { RunEventData, RunEventName } from './eventNames'
import { createSummarySink } from './eventSink'
import { memorySampleOf, runProgressOf, type MemoryReadings } from './memorySample'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'

const MIB = 1024 * 1024

const READINGS: MemoryReadings = {
  elapsedSeconds: 20,
  page: {
    jsHeap: { usedBytes: 142.3 * MIB, totalBytes: 180 * MIB + 1234, limitBytes: 4096 * MIB },
    domNodes: 412,
    listeners: 37,
  },
  scene: {
    geometries: 388,
    textures: 21,
    programs: 14,
    rigidBodies: 1,
    colliders: 9,
    wasmBytes: 1_376_256,
    chunksCached: 64,
    chunksMeshed: 12,
  },
  progress: {
    maxDepthTiles: 34,
    tilesDestroyed: 610,
    mineralsCollected: 57,
    moneyTotal: '1.25e+3',
  },
}

let nextSeq = 0

function line<N extends RunEventName>(
  tick: number,
  event: N,
  data: RunEventData<N>,
  depthTiles = 0,
): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: nextSeq++,
    tick,
    timestamp: 0,
    runId: 'run_test',
    playerId: 'p1',
    planet: 1,
    depthTiles,
    event,
    data,
  } as RunEvent
}

describe('memory sample', () => {
  it('turns heap and WASM bytes into MiB to hundredths and keeps every count', () => {
    expect(memorySampleOf(READINGS)).toEqual({
      elapsedS: 20,
      jsHeapUsedMB: 142.3,
      jsHeapTotalMB: 180,
      jsHeapLimitMB: 4096,
      wasmMB: 1.31,
      geometries: 388,
      textures: 21,
      programs: 14,
      rigidBodies: 1,
      colliders: 9,
      chunksCached: 64,
      chunksMeshed: 12,
      domNodes: 412,
      listeners: 37,
      maxDepthTiles: 34,
      tilesDestroyed: 610,
      mineralsCollected: 57,
      moneyTotal: '1.25e+3',
    })
  })

  it('writes no line where the browser gives no heap reading', () => {
    expect(memorySampleOf({ ...READINGS, page: { ...READINGS.page, jsHeap: null } })).toBeNull()
  })

  it('reads progress from the run so far: deepest tile, tiles destroyed, units and money earned', () => {
    const summary = createSummarySink()
    summary.append(line(600, 'mining_interval', miningInterval(40, 10, '1.5e+1'), 18))
    summary.append(line(1200, 'mining_interval', miningInterval(25, 3, '9e+0'), 31))
    summary.append(line(1300, 'resource_sold', { items: [], value: '2.4e+1', mode: 'all' }))
    expect(runProgressOf(summary.summarize())).toEqual({
      maxDepthTiles: 31,
      tilesDestroyed: 65,
      mineralsCollected: 13,
      moneyTotal: '2.4e+1',
    })
  })
})

function miningInterval(tilesDestroyed: number, amount: number, value: string) {
  return { tilesDestroyed, collected: [{ tier: 1, amount, value }], drillDamageDealt: '1e+2' }
}
