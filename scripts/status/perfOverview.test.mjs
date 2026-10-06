import { describe, expect, it } from 'vitest'
import {
  UNREGISTERED_GROUP,
  buildPerfOverview,
  deltaOf,
  figureIdOf,
  niceCeilingOf,
  parsePerfHistory,
} from './perfOverview.mjs'

const REPO = 'bjor2/steampunk-miner'

function line(entry) {
  return JSON.stringify(entry)
}

const REGISTRY = {
  groups: ['CPU benches', 'Memory soak'],
  metrics: {
    'soak.heapEndMB': { label: 'Heap at end', unit: 'MB', group: 'Memory soak', better: 'lower' },
    'gen.p95Ms': {
      label: 'generateChunk p95',
      unit: 'ms',
      group: 'CPU benches',
      better: 'lower',
      budget: 2,
    },
    'stack.maxOkDepth': {
      label: 'Depth survived',
      unit: 'levels',
      group: 'Stack',
      better: 'higher',
    },
  },
}

describe('perf overview history order', () => {
  it('orders runs by committedAt, then measuredAt, keeping file order on ties', () => {
    const text = [
      line({
        commit: 'c'.repeat(40),
        committedAt: '2026-10-03T10:00:00+02:00',
        measuredAt: '2026-10-03T12:00:00Z',
        metrics: { a: 3 },
      }),
      line({
        commit: 'a'.repeat(40),
        committedAt: '2026-10-01T10:00:00Z',
        measuredAt: '2026-10-02T09:00:00Z',
        metrics: { a: 1 },
      }),
      line({
        commit: 'a'.repeat(40),
        committedAt: '2026-10-01T12:00:00+02:00',
        measuredAt: '2026-10-01T20:00:00Z',
        metrics: { a: 2 },
      }),
      line({ commit: 'b'.repeat(40), committedAt: '2026-10-02T10:00:00Z', metrics: { a: 9 } }),
      line({ commit: 'b'.repeat(40), committedAt: '2026-10-02T10:00:00Z', metrics: { a: 8 } }),
    ].join('\n')
    const { runs, problems } = parsePerfHistory(text)
    expect(runs.map((run) => run.metrics.a)).toEqual([2, 1, 9, 8, 3])
    expect(runs.map((run) => run.shortSha)).toEqual([
      'aaaaaaa',
      'aaaaaaa',
      'bbbbbbb',
      'bbbbbbb',
      'ccccccc',
    ])
    expect(problems).toEqual([])
  })

  it('skips an invalid JSON line and a line without commit or committedAt, with a warning each', () => {
    const text = [
      '{not json',
      line({ committedAt: '2026-10-01T10:00:00Z', metrics: { a: 1 } }),
      line({ commit: 'd'.repeat(40), metrics: { a: 1 } }),
      line({ commit: 'e'.repeat(40), committedAt: '2026-10-01T10:00:00Z', metrics: { a: 5 } }),
      '',
    ].join('\n')
    const { runs, problems } = parsePerfHistory(text)
    expect(runs.map((run) => run.commit)).toEqual(['e'.repeat(40)])
    expect(problems).toEqual([
      'history line 1: invalid JSON, skipped',
      'history line 2: missing commit, skipped',
      'history line 3: missing or unreadable committedAt, skipped',
    ])
  })

  it('drops a non-finite metric value with a warning and keeps the run', () => {
    const text = line({
      commit: 'f'.repeat(40),
      committedAt: '2026-10-01T10:00:00Z',
      metrics: { a: 'fast', b: null, c: 2.5 },
    })
    const { runs, problems } = parsePerfHistory(text)
    expect(runs[0].metrics).toEqual({ c: 2.5 })
    expect(problems).toEqual([
      'history line 1: a is not a finite number, value dropped',
      'history line 1: b is not a finite number, value dropped',
    ])
  })
})

describe('perf overview deltas', () => {
  it('calls a drop good when lower is better', () => {
    expect(deltaOf(1.5, 2, 'lower')).toEqual({ absolute: -0.5, percent: -25, direction: 'good' })
  })

  it('calls a drop bad when higher is better', () => {
    expect(deltaOf(800, 1000, 'higher')).toEqual({ absolute: -200, percent: -20, direction: 'bad' })
  })

  it('calls a rise bad when lower is better and good when higher is better', () => {
    expect(deltaOf(3, 2, 'lower')).toEqual({ absolute: 1, percent: 50, direction: 'bad' })
    expect(deltaOf(3, 2, 'higher')).toEqual({ absolute: 1, percent: 50, direction: 'good' })
  })

  it('reports no change as flat and no percent against a zero reference', () => {
    expect(deltaOf(2, 2, 'lower')).toEqual({ absolute: 0, percent: 0, direction: 'flat' })
    expect(deltaOf(0, 0, 'lower')).toEqual({ absolute: 0, percent: null, direction: 'flat' })
    expect(deltaOf(1, 0, 'lower')).toEqual({ absolute: 1, percent: null, direction: 'bad' })
  })
})

describe('perf overview charts', () => {
  const history = [
    line({
      commit: '1'.repeat(40),
      committedAt: '2026-10-01T10:00:00Z',
      measuredAt: '2026-10-01T11:00:00Z',
      source: 'bench',
      metrics: { 'gen.p95Ms': 2 },
    }),
    line({
      commit: '2'.repeat(40),
      committedAt: '2026-10-02T10:00:00Z',
      measuredAt: '2026-10-02T11:00:00Z',
      source: 'bench',
      metrics: { 'gen.p95Ms': 1.5, 'stack.maxOkDepth': 1000 },
    }),
    line({
      commit: '2'.repeat(40),
      committedAt: '2026-10-02T10:00:00Z',
      measuredAt: '2026-10-02T12:00:00Z',
      source: 'soak',
      machine: 'box',
      env: 'quiet',
      metrics: { 'soak.heapEndMB': 45.5, 'mystery.count': 7 },
    }),
    line({
      commit: '3'.repeat(40),
      committedAt: '2026-10-03T10:00:00Z',
      measuredAt: '2026-10-03T11:00:00Z',
      source: 'bench',
      metrics: { 'gen.p95Ms': 2.5, 'stack.maxOkDepth': 800 },
    }),
  ].join('\n')

  it('gives each metric the runs that contain it, with deltas vs previous and first', () => {
    const model = buildPerfOverview({ historyText: history, registry: REGISTRY, repo: REPO })
    const chart = model.groups[0].charts[0]
    expect(chart.id).toBe('gen.p95Ms')
    expect(chart.points.map((p) => [p.shortSha, p.value, p.overBudget])).toEqual([
      ['1111111', 2, false],
      ['2222222', 1.5, false],
      ['3333333', 2.5, true],
    ])
    expect(chart.latest).toBe(2.5)
    expect(chart.latestOverBudget).toBe(true)
    expect(chart.deltaFromPrevious.absolute).toBe(1)
    expect(chart.deltaFromPrevious.percent).toBeCloseTo(66.667, 3)
    expect(chart.deltaFromPrevious.direction).toBe('bad')
    expect(chart.deltaFromFirst).toEqual({ absolute: 0.5, percent: 25, direction: 'bad' })
  })

  it('groups charts in registry group order, unlisted registered groups after, unregistered last', () => {
    const model = buildPerfOverview({ historyText: history, registry: REGISTRY, repo: REPO })
    expect(model.groups.map((g) => [g.name, g.charts.map((c) => c.id)])).toEqual([
      ['CPU benches', ['gen.p95Ms']],
      ['Memory soak', ['soak.heapEndMB']],
      ['Stack', ['stack.maxOkDepth']],
      [UNREGISTERED_GROUP, ['mystery.count']],
    ])
    expect(model.runCount).toBe(4)
    expect(model.metricCount).toBe(4)
  })

  it('still charts a metric that is not in the registry, labelled by its id, and lists it', () => {
    const model = buildPerfOverview({ historyText: history, registry: REGISTRY, repo: REPO })
    const chart = model.groups.at(-1).charts[0]
    expect(chart).toMatchObject({
      id: 'mystery.count',
      label: 'mystery.count',
      unit: '',
      better: 'lower',
      budget: null,
      registered: false,
      figureId: 'metric-mystery-count',
      latest: 7,
      deltaFromPrevious: null,
      deltaFromFirst: null,
    })
    expect(model.unregistered).toEqual(['mystery.count'])
  })

  it('judges a higher-is-better metric so that a drop is bad and no budget means no verdict', () => {
    const model = buildPerfOverview({ historyText: history, registry: REGISTRY, repo: REPO })
    const chart = model.groups[2].charts[0]
    expect(chart.deltaFromPrevious).toEqual({ absolute: -200, percent: -20, direction: 'bad' })
    expect(chart.latestOverBudget).toBeNull()
  })

  it('names the latest measured run with its machine and env, and renders no registered id without data', () => {
    const model = buildPerfOverview({ historyText: history, registry: REGISTRY, repo: REPO })
    expect(model.latestRun).toMatchObject({
      shortSha: '3333333',
      measuredAt: '2026-10-03T11:00:00Z',
      source: 'bench',
    })
    const onlySoak = buildPerfOverview({
      historyText: history.split('\n')[2],
      registry: REGISTRY,
      repo: REPO,
    })
    expect(onlySoak.latestRun).toMatchObject({ source: 'soak', machine: 'box', env: 'quiet' })
    expect(onlySoak.groups.flatMap((g) => g.charts.map((c) => c.id))).toEqual([
      'soak.heapEndMB',
      'mystery.count',
    ])
  })

  it('ends the y axis on a round number above the data and the budget', () => {
    const model = buildPerfOverview({
      historyText: line({
        commit: '9'.repeat(40),
        committedAt: '2026-10-01T10:00:00Z',
        metrics: { 'gen.p95Ms': 1.618, 'soak.heapEndMB': 45.61 },
      }),
      registry: {
        ...REGISTRY,
        metrics: {
          ...REGISTRY.metrics,
          'gen.p95Ms': { ...REGISTRY.metrics['gen.p95Ms'], budget: 600 },
        },
      },
      repo: REPO,
    })
    expect(model.groups[0].charts[0].yMax).toBe(800)
    expect(model.groups[1].charts[0].yMax).toBe(50)
    expect(niceCeilingOf(0)).toBe(1)
    expect(niceCeilingOf(275)).toBe(300)
  })

  it('builds the figure id from the metric id with every non-alphanumeric replaced', () => {
    expect(figureIdOf('generateChunk.p1.p95Ms')).toBe('metric-generateChunk-p1-p95Ms')
    expect(figureIdOf('a b/c')).toBe('metric-a-b-c')
  })
})
