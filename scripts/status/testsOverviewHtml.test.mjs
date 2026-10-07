import { describe, expect, it } from 'vitest'
import { readTestsOverview, readTestsQuery } from './testsOverview.mjs'
import {
  renderTestsList,
  renderTestsOverview,
  renderTestsOverviewFailure,
  sparklineSvg,
  testsHashOf,
} from './testsOverviewHtml.mjs'

const SHA = 'e8d776b6afdbe7cb411fcea37d2753ba1dae2ddf'
const FILE = 'src/features/ores/systems/oreTiers.test.ts'
const VIEW = { repo: 'o/r', nowMs: Date.parse('2026-10-07T10:00:00Z') }

const runLine = (id) => ({
  id,
  url: 'https://github.com/o/r/blob/test-metrics/runs/2026-10/3.json',
  sha: SHA,
  startedAt: '2026-10-07T01:30:00Z',
  source: 'box',
  phase: 'nightly',
  conclusion: 'success',
  isComplete: true,
})

const HISTORY = {
  updatedAt: '2026-10-07T02:00:00Z',
  currentRunId: 3,
  runs: [runLine(1), runLine(2), runLine(3)],
  files: {
    [FILE]: {
      feature: 'ores',
      area: 'ores',
      status: 'failed',
      ms: [100, 110, 400],
      tests: {
        'ore tiers sell <one> tier up': [[10, 10, 300], 'ppp'],
        'ore tiers drill deeper': [[5, null, 6], 'p-f'],
      },
    },
  },
}

const render = (params = {}) =>
  renderTestsOverview(readTestsOverview(HISTORY, readTestsQuery(params)), VIEW)

describe('tests overview html', () => {
  it('shows each test with its feature, status, duration and a link to its file at the commit', () => {
    const html = render()

    expect(html).toContain('ore tiers sell &lt;one&gt; tier up')
    expect(html).toContain(`href="https://github.com/o/r/blob/${SHA}/${FILE}"`)
    expect(html).toContain('<td class="bad">failed</td>')
    expect(html).toContain('300 ms')
  })

  it('says which run the list comes from and counts pass, fail and skip', () => {
    const html = render()

    expect(html).toContain(`/commit/${SHA}">e8d776b</a>`)
    expect(html).toContain('<b>2</b> tests in <b>1</b> files')
    expect(html).toContain('<span class="bad">1 failed</span>')
    expect(html).toContain('trend over the last 3 runs')
  })

  it('marks a test and a feature getting slower and links the slow-down sort', () => {
    const html = render()

    // The feature row, and the test in both the slowest table and the list.
    expect(html.match(/>slower</g)).toHaveLength(3)
    expect(html).toContain('href="#tests?sort=slowdown">')
    expect(html).toContain('te-spark slow')
  })

  it('links each feature to the list filtered on it', () => {
    expect(render()).toContain('<a href="#tests?feature=ores">ores</a>')
  })

  it('keeps the chosen filters selected in the filter bar', () => {
    const html = render({ status: 'failed', sort: 'file', q: 'drill' })

    expect(html).toContain('<option value="failed" selected>')
    expect(html).toContain('<option value="file" selected>')
    expect(html).toContain('value="drill"')
  })

  it('says when no test matches the filter', () => {
    const model = readTestsOverview(HISTORY, readTestsQuery({ q: 'no such test' }))

    expect(renderTestsList(model, VIEW)).toContain('No test matches the filter.')
  })

  it('breaks the sparkline where a run skipped the test', () => {
    const svg = sparklineSvg({ trend: [5, null, 6], isSlowing: false }, HISTORY.runs)

    expect(svg.match(/<circle/g)).toHaveLength(2)
    expect(svg).not.toContain('<polyline')
    expect(svg).toContain('e8d776b: not run')
  })

  it('builds the hash of a query from its non-default parts', () => {
    expect(testsHashOf(readTestsQuery({}))).toBe('#tests')
    expect(testsHashOf(readTestsQuery({ feature: 'kernel', all: '1' }))).toBe(
      '#tests?feature=kernel&all=1',
    )
  })

  it('renders the failure note when tests.json is unavailable', () => {
    expect(renderTestsOverviewFailure('gone <now>')).toContain('gone &lt;now&gt;')
  })
})
