import { describe, expect, it } from 'vitest'
import { benchmarkResultEvents, formatBenchmarkSummary } from './benchmarkResult'
import { formatNdjsonLine, parseNdjson } from './ndjson'
import { runEventProblems } from './runEventSchema'

const RUN = {
  runId: 'run_2026-10-06_20-00-00_bench-ground',
  commit: '2706ad4c0ffee2706ad4c0ffee2706ad4c0ffee0',
  secondsSinceStart: () => 4.25,
}

/** Twenty samples of 0.1 ms to 2.0 ms, shuffled so the order cannot decide the percentile. */
const TWENTY_SAMPLES_MS = [
  1.3, 0.2, 2.0, 0.7, 1.1, 0.4, 1.9, 0.1, 1.6, 0.9, 0.5, 1.4, 0.3, 1.8, 0.8, 1.2, 0.6, 1.7, 1.0,
  1.5,
]

const SERIES = [
  { name: 'generateChunk', planet: 1, timesMs: TWENTY_SAMPLES_MS },
  { name: 'generateChunk', planet: 2, timesMs: [0.0004, 0.0123456] },
]

describe('benchmark results', () => {
  it('writes one valid benchmark_result line per timed series', () => {
    const lines = benchmarkResultEvents(RUN, SERIES).map(formatNdjsonLine).join('')
    const events = parseNdjson(lines)
    expect(events.map((event) => event.event)).toEqual(['benchmark_result', 'benchmark_result'])
    expect(events.flatMap(runEventProblems)).toEqual([])
  })

  it('reports the median and 95th percentile in whole microseconds with the sample count and commit', () => {
    const [first, second] = benchmarkResultEvents(RUN, SERIES)
    expect(first.data).toEqual({
      name: 'generateChunk',
      medianUs: 1100,
      p95Us: 2000,
      runs: 20,
      commit: RUN.commit,
    })
    expect(second.data).toMatchObject({ medianUs: 12, p95Us: 12, runs: 2 })
  })

  it('stamps each line with its series planet, the run id and an increasing seq', () => {
    const events = benchmarkResultEvents(RUN, SERIES)
    expect(events.map(({ planet, seq, runId }) => ({ planet, seq, runId }))).toEqual([
      { planet: 1, seq: 0, runId: RUN.runId },
      { planet: 2, seq: 1, runId: RUN.runId },
    ])
  })

  it('summarizes each logged result as one job-summary row in milliseconds', () => {
    expect(formatBenchmarkSummary(benchmarkResultEvents(RUN, SERIES))).toBe(
      [
        '| bench | planet | median ms | p95 ms | samples | commit |',
        '| --- | --- | --- | --- | --- | --- |',
        '| generateChunk | 1 | 1.100 | 2.000 | 20 | 2706ad4 |',
        '| generateChunk | 2 | 0.012 | 0.012 | 2 | 2706ad4 |',
      ].join('\n'),
    )
  })
})
