import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import type { SceneMemory } from '../logging/memorySample'
import { perfSampleOf, type FrameCost } from '../logging/perfSample'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { resetGameStore } from './gameStore'
import {
  recordMemorySample,
  recordPerfSample,
  turnOffPerfLog,
  turnOnPerfLog,
  type PerfLogSources,
} from './perfLog'

const SECOND_AT_4K: FrameCost = {
  frameMsP50: 15.234,
  frameMsP95: 16.6789,
  frameMsP99: 61.004,
  longFrames: 1,
  renderScale: 0.6500001,
  drawCalls: 41,
  triangles: 2608,
  groundBlocks: 37,
  drawnChunks: 6,
  groundColliders: 8,
}

const MIB = 1024 * 1024

const SCENE_AFTER_A_DIVE: SceneMemory = {
  geometries: 40,
  textures: 21,
  programs: 9,
  rigidBodies: 1,
  colliders: 7,
  wasmBytes: 1_376_256,
  chunksCached: 64,
  chunksMeshed: 12,
}

/** A Chromium page part way down planet 1. */
const CHROMIUM_PAGE: PerfLogSources = {
  readPageMemory: () => ({
    jsHeap: { usedBytes: 61.5 * MIB, totalBytes: 80 * MIB, limitBytes: 4096 * MIB },
    domNodes: 120,
    listeners: 31,
  }),
  readRunProgress: () => ({
    maxDepthTiles: 22,
    tilesDestroyed: 140,
    mineralsCollected: 18,
    moneyTotal: '3.6e+2',
  }),
}

let sink: MemorySink

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => {
  turnOffPerfLog()
  uninstallRunLog()
})

describe('perf log', () => {
  it('records one valid perf_sample with the render scale, frame times, long tasks, draws and blocks (#38, #121)', () => {
    turnOnPerfLog(CHROMIUM_PAGE)
    recordPerfSample(perfSampleOf(SECOND_AT_4K, 1.774))
    expect(sink.events).toHaveLength(1)
    const [line] = sink.events
    expect(runEventProblems(line)).toEqual([])
    expect(line).toMatchObject({
      event: 'perf_sample',
      data: {
        frameMsP50: 15.23,
        frameMsP95: 16.68,
        frameMsP99: 61,
        longTasks: 1,
        terrainMsP95: 1.77,
        renderScale: 0.65,
        drawCalls: 41,
        triangles: 2608,
        groundBlocks: 37,
        chunksLoaded: 6,
        colliders: 8,
      },
    })
  })

  it('records nothing on a played run, where perf lines are off', () => {
    recordPerfSample(perfSampleOf(SECOND_AT_4K, 1.774))
    expect(sink.events).toEqual([])
  })
})

describe('memory log', () => {
  it('records one valid memory_sample with every field, stamped at the authority tick (#121)', () => {
    turnOnPerfLog(CHROMIUM_PAGE)
    recordMemorySample(() => SCENE_AFTER_A_DIVE, 10)
    expect(sink.events).toHaveLength(1)
    const [line] = sink.events
    expect(runEventProblems(line)).toEqual([])
    expect(line).toMatchObject({
      event: 'memory_sample',
      tick: 0,
      data: {
        elapsedS: 10,
        jsHeapUsedKB: 62976,
        wasmKB: 1344,
        colliders: 7,
        chunksMeshed: 12,
        listeners: 31,
        mineralsCollected: 18,
        moneyTotal: '3.6e+2',
      },
    })
  })

  it('reads nothing and records nothing on a played run, where perf lines are off', () => {
    let reads = 0
    recordMemorySample(() => {
      reads++
      return SCENE_AFTER_A_DIVE
    }, 10)
    expect(reads).toBe(0)
    expect(sink.events).toEqual([])
  })

  it('records nothing while the renderer or the physics world is not up', () => {
    turnOnPerfLog(CHROMIUM_PAGE)
    recordMemorySample(() => null, 10)
    expect(sink.events).toEqual([])
  })

  it('records nothing in a browser without a heap reading', () => {
    const page = CHROMIUM_PAGE.readPageMemory()
    turnOnPerfLog({ ...CHROMIUM_PAGE, readPageMemory: () => ({ ...page, jsHeap: null }) })
    recordMemorySample(() => SCENE_AFTER_A_DIVE, 10)
    expect(sink.events).toEqual([])
  })
})
