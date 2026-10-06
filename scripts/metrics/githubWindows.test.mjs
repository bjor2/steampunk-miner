import { describe, expect, it } from 'vitest'
import { githubWindows } from './githubWindows.mjs'

// Events as `gh api repos/<repo>/issues/<n>/timeline` returns them (trimmed to what is read).
function labelEvent(event, name, iso) {
  return { event, created_at: iso, label: { name } }
}
function dependencyEvent(event, number, iso) {
  return { event, created_at: iso, blocked_by: { number } }
}
const ms = Date.parse

describe('ticket phases: GitHub timeline windows', () => {
  it('waits on planners while the needs-planner label is on', () => {
    const windows = githubWindows(
      [
        labelEvent('labeled', 'in-progress', '2026-10-06T01:17:55Z'),
        labelEvent('labeled', 'needs-planner', '2026-10-06T01:46:42Z'),
        labelEvent('unlabeled', 'needs-planner', '2026-10-06T01:59:45Z'),
        labelEvent('labeled', 'needs-planner', '2026-10-06T03:02:38Z'),
      ],
      new Map(),
    )
    expect(windows).toEqual([
      {
        category: 'planner_wait',
        start: ms('2026-10-06T01:46:42Z'),
        end: ms('2026-10-06T01:59:45Z'),
        source: 'github',
      },
      {
        category: 'planner_wait',
        start: ms('2026-10-06T03:02:38Z'),
        end: Infinity,
        source: 'github',
      },
    ])
  })

  it('is blocked while a blocked_by issue is open or the blocked label is on', () => {
    const blockers = new Map([
      [84, { createdAt: '2026-10-05T20:00:00Z', closedAt: '2026-10-06T07:01:19Z' }],
      [129, { createdAt: '2026-10-06T07:30:00Z', closedAt: '2026-10-06T07:59:10Z' }],
      [83, { createdAt: '2026-10-05T20:00:00Z', closedAt: null }],
    ])
    const windows = githubWindows(
      [
        dependencyEvent('blocked_by_added', 84, '2026-10-06T06:16:31Z'),
        dependencyEvent('blocked_by_added', 129, '2026-10-06T06:16:33Z'),
        dependencyEvent('blocked_by_added', 83, '2026-10-06T06:20:00Z'),
        dependencyEvent('blocked_by_removed', 83, '2026-10-06T06:30:00Z'),
        labelEvent('labeled', 'blocked', '2026-10-06T09:00:00Z'),
        labelEvent('unlabeled', 'blocked', '2026-10-06T09:10:00Z'),
      ],
      blockers,
    )
    const blocked = windows.map((w) => [w.category, w.start, w.end])
    expect(blocked).toEqual([
      ['blocked', ms('2026-10-06T06:16:31Z'), ms('2026-10-06T07:01:19Z')],
      ['blocked', ms('2026-10-06T06:20:00Z'), ms('2026-10-06T06:30:00Z')],
      ['blocked', ms('2026-10-06T07:30:00Z'), ms('2026-10-06T07:59:10Z')],
      ['blocked', ms('2026-10-06T09:00:00Z'), ms('2026-10-06T09:10:00Z')],
    ])
  })

  it('never counts a blocker it could not look up, or one closed before it was added', () => {
    const blockers = new Map([
      [5, { createdAt: '2026-10-01T00:00:00Z', closedAt: '2026-10-02T00:00:00Z' }],
    ])
    const windows = githubWindows(
      [
        dependencyEvent('blocked_by_added', 5, '2026-10-06T06:00:00Z'),
        dependencyEvent('blocked_by_added', 9, '2026-10-06T06:00:00Z'),
      ],
      blockers,
    )
    expect(windows).toEqual([])
  })
})
