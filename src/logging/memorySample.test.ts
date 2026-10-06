import { describe, expect, it } from 'vitest'
import { memorySampleOf, type MemoryReadings } from './memorySample'

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
})
