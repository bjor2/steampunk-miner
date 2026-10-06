import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink, type MemorySink } from '../logging/eventSink'
import { perfSampleOf, type FrameCost } from '../logging/perfSample'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { resetGameStore } from './gameStore'
import { recordPerfSample, turnOffPerfLog, turnOnPerfLog } from './perfLog'

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
    turnOnPerfLog()
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
