import { describe, expect, it } from 'vitest'
import { TESTER_STALE_AFTER_H, readTestsModel, testsTabBadge } from './tests.mjs'
import { renderTestsFailure, renderTestsPanel } from './testsHtml.mjs'

const NOW_MS = Date.parse('2026-10-07T10:00:00Z')
const HOUR_MS = 3_600_000
const SHA = 'e8d776b6afdbe7cb411fcea37d2753ba1dae2ddf'

function run(over) {
  return {
    id: 1,
    url: 'https://github.com/o/r/commit/x',
    event: 'pass',
    mode: 'scoped',
    sha: SHA,
    startedAt: '2026-10-07T09:00:00Z',
    jobConclusion: 'success',
    timedOut: false,
    jobDurationSec: 75,
    source: 'box',
    phase: 'fast',
    job: 'fast',
    reportFound: true,
    files: 10,
    tests: 90,
    failed: 0,
    ...over,
  }
}

function summary(runs) {
  return {
    updatedAt: '2026-10-07T09:05:00Z',
    runs,
    files: {
      'src/a.test.ts': {
        feature: 'a',
        p95Ms: 9000,
        passRate: 0.5,
        lastStatus: 'failed',
        flaky: true,
      },
      'src/b.test.ts': {
        feature: 'b',
        p95Ms: 300,
        passRate: 1,
        lastStatus: 'passed',
        flaky: false,
      },
    },
  }
}

const view = { repo: 'o/r', nowMs: NOW_MS }

describe('readTestsModel', () => {
  it('splits box runs by phase and keeps the older Actions runs in the list', () => {
    const model = readTestsModel({
      summary: summary([
        run({
          id: 1,
          source: 'actions',
          phase: null,
          job: 'verify',
          startedAt: '2026-10-06T20:00:00Z',
        }),
        run({ id: 2 }),
        run({
          id: 3,
          phase: 'slow',
          job: 'slow',
          mode: 'nightly-only',
          startedAt: '2026-10-07T09:10:00Z',
        }),
      ]),
      nowMs: NOW_MS,
    })
    expect(model.runs.map((r) => r.id)).toEqual([3, 2, 1])
    expect(model.latestByPhase.fast.id).toBe(2)
    expect(model.latestByPhase.slow.id).toBe(3)
    expect(model.latestByPhase.nightly).toBeNull()
    expect(model.boxRunCount).toBe(2)
    expect(model.failingFiles.map((f) => f.file)).toEqual(['src/a.test.ts'])
    expect(model.slowestFiles[0].file).toBe('src/a.test.ts')
  })

  it(`flags a tester with no run for over ${TESTER_STALE_AFTER_H} h`, () => {
    const old = new Date(NOW_MS - (TESTER_STALE_AFTER_H + 1) * HOUR_MS).toISOString()
    const model = readTestsModel({ summary: summary([run({ startedAt: old })]), nowMs: NOW_MS })
    expect(model.freshness.isStale).toBe(true)
    expect(testsTabBadge(model).text).toBe('stale')
    expect(renderTestsPanel(model, view)).toContain(
      `No box Tester run in ${TESTER_STALE_AFTER_H} h`,
    )
  })

  it('shows main red, the running phase and the box-tester commit statuses', () => {
    const model = readTestsModel({
      summary: summary([run({})]),
      statuses: {
        sha: SHA,
        statuses: [
          { context: 'box-tester/slow', state: 'pending', description: 'pacing bot running' },
          {
            context: 'box-tester/fast',
            state: 'success',
            description: 'fast green',
            target_url: 'https://x/y',
          },
          { context: 'ci/other', state: 'success' },
        ],
      },
      tester: {
        state: 'running',
        phase: 'slow',
        sha: SHA,
        since: '2026-10-07T09:50:00Z',
        holds_gate: true,
        main_red_sha: SHA,
        feature: 90,
        feature_title: 'Build plan',
        queue: [
          { feature: 214, title: 'Lone ticket', tickets: [214], since: '2026-10-07T09:40:00Z' },
        ],
      },
      nowMs: NOW_MS,
    })
    expect(model.statuses.map((s) => s.phase)).toEqual(['fast', 'slow'])
    expect(testsTabBadge(model).text).toBe('main red')
    const html = renderTestsPanel(model, view)
    expect(html).toContain('MAIN RED')
    expect(html).toContain('running slow')
    expect(html).toContain('box-tester/fast')
    expect(html).toContain('holds a gate token')
    expect(html).toContain('testing feature <a href="https://github.com/o/r/issues/90">#90</a>')
    expect(html).toContain('Features awaiting test')
    expect(html).toContain('Lone ticket')
  })

  it('falls back to the newest tested commit while main tip has no box status', () => {
    const model = readTestsModel({
      summary: summary([run({})]),
      statuses: { sha: 'aaaaaaa1', statuses: [] },
      testedStatuses: { sha: SHA, statuses: [{ context: 'box-tester/fast', state: 'success' }] },
      nowMs: NOW_MS,
    })
    expect(model.isMainTipTested).toBe(false)
    expect(model.statusSha).toBe(SHA)
    expect(renderTestsPanel(model, view)).toContain('not tested yet')
  })

  it('reports a missing summary', () => {
    const model = readTestsModel({ summary: null, nowMs: NOW_MS })
    expect(model.error).toMatch(/summary/)
    expect(renderTestsFailure(model.error)).toContain('unavailable')
  })
})
