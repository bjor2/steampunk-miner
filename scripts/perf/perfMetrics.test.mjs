import { describe, expect, it } from 'vitest'
import { medianMetricsOf, metricsOfBenchLine, metricsOfMeasurementFile } from './perfMetrics.mjs'

describe('perf metrics from a bench line', () => {
  it('names each timing after the bench and planet and leaves budgets and workload out', () => {
    const line = {
      bench: 'generateChunk',
      planetIndex: 2,
      chunks: 676,
      p50Ms: 1.226,
      p95Ms: 3.0971,
      budgetP95Ms: 2,
      isWithinBudget: false,
    }

    expect(metricsOfBenchLine(line)).toEqual({
      'generateChunk.p2.p50Ms': 1.226,
      'generateChunk.p2.p95Ms': 3.097,
    })
  })

  it('keeps peak counts and names a planet-less bench by the bench alone', () => {
    const line = {
      bench: 'groundDrilling',
      reports: 240,
      carveP95Ms: 16.626,
      liveCollidersMax: 8,
      budget: { carveAndRemeshP95Ms: 1 },
    }

    expect(metricsOfBenchLine(line)).toEqual({
      'groundDrilling.carveP95Ms': 16.626,
      'groundDrilling.liveCollidersMax': 8,
    })
  })
})

describe('perf metrics over several runs', () => {
  it('records the median of each metric over the runs', () => {
    const runs = [{ a: 5 }, { a: 1 }, { a: 3 }, { a: 9 }, { a: 2 }]

    expect(medianMetricsOf(runs)).toEqual({ a: 3 })
  })

  it('takes the mean of the middle two for an even run count', () => {
    expect(medianMetricsOf([{ a: 1 }, { a: 4 }, { a: 2 }, { a: 10 }])).toEqual({ a: 3 })
  })
})

describe('perf metrics from a measurement file', () => {
  it('reads the medians of a bench summary', () => {
    const file = {
      summary: [
        { case: 'generateChunk p1', metric: 'p95Ms', median: 1.618 },
        { case: 'groundDrilling', metric: 'liveCollidersMax', median: 8 },
      ],
    }

    expect(metricsOfMeasurementFile(file)).toEqual({
      kind: 'bench-summary',
      metrics: { 'generateChunk.p1.p95Ms': 1.618, 'groundDrilling.liveCollidersMax': 8 },
    })
  })

  it('renames the soak summary fields and rounds float noise away', () => {
    const file = {
      heapSlopeMBperCycle: 0.121,
      peakUsedJSHeapMB: 46.6,
      frameP50median: 183.29999999,
    }

    expect(metricsOfMeasurementFile(file).metrics).toEqual({
      'soak.heapGrowthMBPerCycle': 0.121,
      'soak.heapPeakMB': 46.6,
      'soak.frameP50Ms': 183.3,
    })
  })

  it('reads what is still allocated at the last soak cycle boundary', () => {
    const file = {
      boundaries: [
        { geometries: 31, textures: 18, rapierColliders: 4 },
        { geometries: 34, textures: 21, rapierColliders: 4 },
      ],
    }

    expect(metricsOfMeasurementFile(file).metrics).toEqual({
      'soak.geometriesAtLastBoundary': 34,
      'soak.texturesAtLastBoundary': 21,
      'soak.collidersAtLastBoundary': 4,
    })
  })

  it('files an Electron soak under its own ids, apart from the Chromium soak', () => {
    const summary = { target: 'electron', heapSlopeMBperCycle: 0.2, peakUsedJSHeapMB: 51.25 }
    const run = { target: 'electron', boundaries: [{ geometries: 33, textures: 6 }] }

    expect(metricsOfMeasurementFile(summary).metrics).toEqual({
      'soakElectron.heapGrowthMBPerCycle': 0.2,
      'soakElectron.heapPeakMB': 51.25,
    })
    expect(metricsOfMeasurementFile(run).metrics).toEqual({
      'soakElectron.geometriesAtLastBoundary': 33,
      'soakElectron.texturesAtLastBoundary': 6,
    })
  })

  it('records the deepest nesting a walker survived before its first stack overflow', () => {
    const file = {
      stackSizeFlag: 'default',
      results: [
        { name: 'toCanonicalJson(nested object)', depth: 2000, outcome: 'RangeError' },
        { name: 'toCanonicalJson(nested object)', depth: 1000, outcome: 'ok' },
        { name: 'JSON.parse(nested array)', depth: 100000, outcome: 'ok' },
      ],
    }

    expect(metricsOfMeasurementFile(file).metrics).toEqual({
      'stack.toCanonicalJson.maxOkDepth': 1000,
    })
  })

  it('records a plain metrics file as written', () => {
    expect(metricsOfMeasurementFile({ metrics: { 'e2e.bootMs': 812 } })).toEqual({
      kind: 'metrics',
      metrics: { 'e2e.bootMs': 812 },
    })
  })

  it('refuses a file of an unknown shape', () => {
    expect(() => metricsOfMeasurementFile({ hello: 1 })).toThrow(/unknown measurement file shape/)
  })
})
