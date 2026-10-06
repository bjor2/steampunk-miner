import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { metricsOfMeasurementFile } from '../perf/perfMetrics.mjs'
import { summariseSoak } from './soakSummary.mjs'

const MIB = 1048576
const WASM_PAGE = 65536

function boundary(cycle, t, heapMB, geometries) {
  return {
    cycle,
    t,
    usedJSHeapSize: heapMB * MIB,
    geometries,
    textures: 18,
    rapierColliders: 4,
    rapierBodies: 1,
    wasmBytes: 20 * WASM_PAGE,
  }
}

function sample(t, heapMB, runLogMB, frameP50, frameP95, wasmPages) {
  return {
    t,
    usedJSHeapSize: heapMB * MIB,
    runLogBytes: runLogMB * MIB,
    gameFrameP50Ms: frameP50,
    gameFrameP95Ms: frameP95,
    wasmBytes: wasmPages * WASM_PAGE,
  }
}

/** Three minutes, three cycles: too short for the gate, enough to check every number. */
const SHORT_RUN = {
  minutes: 3,
  consoleErrorCount: 0,
  pageErrors: [],
  refusals: [],
  boundaries: [boundary(1, 60, 40, 31), boundary(2, 120, 42, 34), boundary(3, 180, 44, 34)],
  samples: [
    sample(30, 41, 0, 100, 250, 20),
    sample(90, 46, 1, 200, 300, 22),
    sample(150, 43, 2, 150, 350, 22),
  ],
}

describe('memory soak summary', () => {
  it('reports cycles, heap, counts, frame medians and the gate of a run', () => {
    expect(summariseSoak(SHORT_RUN)).toEqual({
      gate: 'FAIL',
      failures: ['only 0 cycles after warm-up; the gate needs 11'],
      minutes: 3,
      cycles: 3,
      samples: 3,
      pageErrorCount: 0,
      consoleErrorCount: 0,
      refusalCount: 0,
      heapFirstBoundaryMB: 40,
      heapLastBoundaryMB: 44,
      peakUsedJSHeapMB: 46,
      heapSlopeMBperCycle: 2,
      heapSlopeAfterCycle4MBperMin: null,
      heapGateGrowthMB: null,
      geometriesFirstLast: [31, 34],
      texturesFirstLast: [18, 18],
      collidersFirstLast: [4, 4],
      bodiesFirstLast: [1, 1],
      wasmBytesFirstLast: [1310720, 1310720],
      peakWasmMB: 1.375,
      runLogTextMBperMin: 1,
      frameP50median: 150,
      frameP95median: 300,
    })
  })

  it('reports the heap growth the gate judged on a real 10-minute soak', () => {
    const fixture = new URL('./fixtures/soak-boundaries.json', import.meta.url)
    const realSoak = JSON.parse(readFileSync(fixture, 'utf8'))
    const run = { ...realSoak, samples: [], refusals: [], consoleErrorCount: 0 }

    const summary = summariseSoak(run)

    expect(summary.gate).toBe('PASS')
    expect(summary.cycles).toBe(18)
    expect(summary.heapGateGrowthMB).toBe(1.858)
    expect(summary.geometriesFirstLast).toEqual([32, 35])
    expect(metricsOfMeasurementFile(summary).metrics['soak.heapGateGrowthMB']).toBe(1.858)
  })

  it('is read by the perf recorder as the soak metrics of the history', () => {
    const { kind, metrics } = metricsOfMeasurementFile(summariseSoak(SHORT_RUN))

    expect(kind).toBe('soak-summary')
    expect(metrics).toEqual({
      'soak.heapStartMB': 40,
      'soak.heapEndMB': 44,
      'soak.heapPeakMB': 46,
      'soak.heapGrowthMBPerCycle': 2,
      'soak.wasmPeakMB': 1.375,
      'soak.runLogMBPerMin': 1,
      'soak.frameP50Ms': 150,
      'soak.frameP95Ms': 300,
    })
  })
})
