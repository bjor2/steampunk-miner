import { describe, expect, it } from 'vitest'
import { buildPerfOverview } from './perfOverview.mjs'
import {
  formatMetricValue,
  formatStamp,
  renderPerfOverview,
  renderPerfOverviewFailure,
} from './perfOverviewHtml.mjs'

const REPO = 'bjor2/steampunk-miner'

function line(entry) {
  return JSON.stringify(entry)
}

const REGISTRY = {
  groups: ['CPU benches'],
  metrics: {
    'gen.p95Ms': {
      label: 'generateChunk p95',
      unit: 'ms',
      group: 'CPU benches',
      better: 'lower',
      budget: 2,
    },
    'gen.p50Ms': { label: 'generateChunk p50', unit: 'ms', group: 'CPU benches', better: 'lower' },
  },
}

const HISTORY = [
  line({
    commit: 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0',
    committedAt: '2026-10-05T23:37:24+02:00',
    measuredAt: '2026-10-06T00:00:53+02:00',
    source: 'bench',
    load: 7.29,
    metrics: { 'gen.p95Ms': 1.618, 'gen.p50Ms': 1.141, 'odd.one': 3 },
  }),
  line({
    commit: 'b48cc8955970cf2f2303bc46b34feb0f13ff58e7',
    committedAt: '2026-10-06T10:00:00+02:00',
    measuredAt: '2026-10-06T11:00:00+02:00',
    source: 'bench',
    metrics: { 'gen.p95Ms': 2.5, 'gen.p50Ms': 1.2 },
  }),
].join('\n')

function render(historyText = HISTORY, registry = REGISTRY) {
  return renderPerfOverview(buildPerfOverview({ historyText, registry, repo: REPO }))
}

describe('perf overview html', () => {
  it('renders one figure per metric id with the exact id and a commit link per point', () => {
    const html = render()
    expect(html).toContain('<section class="panel" id="perf-summary-panel"><h2>Performance</h2>')
    expect(html).toContain('<section class="panel" id="perf-panel" data-budgets="1" data-over="1"')
    expect(html).toContain(
      '<figure class="perf-chart" id="metric-gen-p95Ms" data-metric="gen.p95Ms">',
    )
    expect(html).toContain(
      '<figure class="perf-chart" id="metric-gen-p50Ms" data-metric="gen.p50Ms">',
    )
    expect(html).toContain(
      '<figure class="perf-chart unregistered" id="metric-odd-one" data-metric="odd.one">',
    )
    expect(html).toContain(
      '<a href="https://github.com/bjor2/steampunk-miner/commit/a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0">',
    )
    expect(html).toContain(
      '<a href="https://github.com/bjor2/steampunk-miner/commit/b48cc8955970cf2f2303bc46b34feb0f13ff58e7">',
    )
    expect(html).toContain(
      '<title>a1b2c3d · 2026-10-05 23:37 +02:00 · bench · 1.618 ms · load 7.29</title>',
    )
    expect(html).toContain(
      '<title>b48cc89 · 2026-10-06 10:00 +02:00 · bench · 2.5 ms · load —</title>',
    )
  })

  it('draws the dashed budget line and verdict only on a chart with a budget', () => {
    const html = render()
    const [, withBudget, withoutBudget] = html.split('<figure ')
    expect(withBudget).toContain('data-metric="gen.p95Ms"')
    expect(withBudget).toContain('class="perf-budget"')
    expect(withBudget).toContain('<title>budget 2 ms</title>')
    expect(withBudget).toContain('<span class="perf-delta bad">over budget 2 ms</span>')
    expect(withBudget).toContain('class="perf-point over"')
    expect(withoutBudget).toContain('data-metric="gen.p50Ms"')
    expect(withoutBudget).not.toContain('perf-budget')
    expect(withoutBudget).not.toContain('perf-point over')
  })

  it('shows the latest value with its deltas coloured by direction', () => {
    const html = render()
    expect(html).toContain('<div class="perf-latest">2.5 ms</div>')
    expect(html).toContain('<span class="perf-delta bad">vs prev +0.882 ms (+54.5%)</span>')
    expect(html).toContain('<span class="perf-delta bad">vs first +0.882 ms (+54.5%)</span>')
    expect(html).toContain('<div class="perf-latest">1.2 ms</div>')
    expect(html).toContain('<span class="perf-delta bad">vs prev +0.059 ms (+5.2%)</span>')
  })

  it('centres a single point and shows dashes instead of deltas', () => {
    const html = render(HISTORY.split('\n')[0])
    const [, , , single] = html.split('<figure ')
    expect(single).toContain('data-metric="odd.one"')
    expect(single).toContain('<circle class="perf-point" cx="174" cy=')
    expect(single).not.toContain('<polyline')
    expect(single).toContain('<span class="perf-delta muted">vs prev —</span>')
    expect(single).toContain('<span class="perf-delta muted">vs first —</span>')
    expect(single).toContain('not in metrics.json')
  })

  it('heads the section with the run and metric counts, the latest run and the update hint', () => {
    const html = render()
    expect(html).toContain(
      '<b>2</b> runs · <b>3</b> metrics · latest <a href="https://github.com/bjor2/steampunk-miner/commit/b48cc8955970cf2f2303bc46b34feb0f13ff58e7" class="mono">b48cc89</a>',
    )
    expect(html).toContain('measured 2026-10-06 11:00 +02:00 · bench')
    expect(html).toContain(
      '<a href="https://github.com/bjor2/steampunk-miner/blob/main/docs/perf/README.md">docs/perf/README.md</a>',
    )
    expect(html).toContain('<code>npm run perf:record -- --source bench</code>')
    expect(html).toContain('<h2>CPU benches</h2>')
    expect(html).toContain('<h2>Not in metrics.json</h2>')
  })

  it('sums up the budgets in cards and gives the tab badge its numbers on the chart panel', () => {
    const html = render()
    expect(html).toContain('<div class="n bad">1</div><div class="l">over budget</div>')
    expect(html).toContain('<div class="n ok">0</div><div class="l">within budget (of 1)</div>')
    expect(html).toContain(
      'data-runs="2" data-last-measured="2026-10-06T11:00:00+02:00"><h2>Charts</h2>',
    )
    expect(html).toContain(
      '<time class="perf-ago" datetime="2026-10-06T11:00:00+02:00">2026-10-06 11:00 +02:00</time>',
    )
  })

  it('lists every budgeted metric with its latest value, headroom and verdict, linked to its chart', () => {
    const html = render()
    const table = html.slice(html.indexOf('<table class="perf-budgets">'), html.indexOf('</table>'))
    expect(table).toContain('<a href="#metric-gen-p95Ms">generateChunk p95</a>')
    expect(table).toContain('<td class="num-r">2.5 ms</td><td class="num-r muted">≤ 2 ms</td>')
    expect(table).toContain('<span class="bad">1.25× budget</span>')
    expect(table).toContain('<span class="badge st-blocked">over</span>')
    expect(table).toContain('>1/2</td>')
    expect(table).not.toContain('gen.p50Ms')
  })

  it('lists the recent runs newest first, naming the metrics a run had over budget', () => {
    const html = render()
    const runs = html.slice(html.indexOf('<table class="perf-runs">'))
    expect(runs.indexOf('b48cc89')).toBeLessThan(runs.indexOf('a1b2c3d'))
    expect(runs).toContain('<span class="bad" title="gen.p95Ms">1 over budget</span>')
  })

  it('lists skipped history lines in the section and escapes text from the files', () => {
    const html = render(
      [
        '{broken',
        line({
          commit: 'c'.repeat(40),
          committedAt: '2026-10-01T00:00:00Z',
          source: '<b>x</b>',
          metrics: { 'a<b': 1 },
        }),
      ].join('\n'),
      {
        groups: [],
        metrics: { 'a<b': { label: 'Tag & co', unit: '"ms"', group: 'G', better: 'lower' } },
      },
    )
    expect(html).toContain('<li>history line 1: invalid JSON, skipped</li>')
    expect(html).toContain('data-metric="a&lt;b"')
    expect(html).toContain(
      '<div class="perf-label">Tag &amp; co <span class="muted">(&quot;ms&quot;)</span></div>',
    )
    expect(html).toContain('· &lt;b&gt;x&lt;/b&gt; · 1 &quot;ms&quot; ·')
    expect(html).not.toContain('<b>x</b>')
  })

  it('thins the sha labels on the x axis when there are many points', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      line({
        commit: `${i.toString(16).repeat(7)}0`,
        committedAt: `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
        metrics: { 'gen.p50Ms': 1 + i },
      }),
    ).join('\n')
    const html = render(many)
    const labels = [...html.matchAll(/text-anchor="middle">([0-9a-f]{7})</g)].map((m) => m[1])
    expect(labels).toEqual(['0000000', '2222222', '4444444', '6666666', '8888888', 'bbbbbbb'])
  })

  it('renders the failure note when the model could not be built', () => {
    expect(renderPerfOverviewFailure('ENOENT <history>')).toBe(
      '<section class="panel" id="perf-panel" data-error="1"><h2>Performance</h2><div class="bad">Performance overview failed to build: ENOENT &lt;history&gt;</div></section>',
    )
  })

  it('formats values and stamps for the eye', () => {
    expect(formatMetricValue(183.29999)).toBe('183.3')
    expect(formatMetricValue(45.613)).toBe('45.61')
    expect(formatMetricValue(0.0234)).toBe('0.023')
    expect(formatMetricValue(2000)).toBe('2000')
    expect(formatStamp('2026-10-06T00:50:52+02:00')).toBe('2026-10-06 00:50 +02:00')
    expect(formatStamp('2026-10-06T00:50:52.123Z')).toBe('2026-10-06 00:50 UTC')
    expect(formatStamp(null)).toBe('—')
  })
})
