import { describe, expect, it } from 'vitest'
import { parseDriverLog, parseLoopStamp } from './loopLog.mjs'

// Lines as the build loop (steampunk-loop/logs/driver.log) and the perf loop
// (perf-loop/logs/driver.log) write them.
const BUILD_LOOP = `[2026-10-06 13:47 CEST] spawned worker slot=3 ticket=#133 pid=745606
[2026-10-06 13:47 CEST] slot 3: ticket #133 "Bug: lava touches" claimed; log /x/logs/133-20261006-134740.log
error: branch 'ticket/133' not found
[2026-10-06 13:47 CEST] slot 3: #133 tier=hard model=opus effort=high
[2026-10-06 14:56 CEST] slot 3: session for #133 exited rc=0
[2026-10-06 15:10 CEST] #133 verified: gates green; pushing before close
[2026-10-06 15:10 CEST] push lock acquired for #133
[2026-10-06 15:10 CEST] rebase onto origin/main FAILED for #134; leaving push_pending
[2026-10-06 15:11 CEST] #134 NOT accepted (needs-fix): gates failed: FAIL test
[2026-10-06 15:12 CEST] recovering push_pending for #134 (ticket/134)
[2026-10-06 15:13 CEST] #134 push failed; issue left open/reopened with needs-fix; push_pending set
[2026-10-06 15:20 CEST] manual land #135: acquired push.lock
[2026-10-06 15:21 CEST] #133 closed after successful push to origin/main`

const PERF_LOOP = `[2026-10-06 08:41 CEST] #118 "Perf 9: Dispose" claimed: tier=easy model=opus effort=medium attempt 1/2
[2026-10-06 09:21 CEST] #118 session exited rc=0
[2026-10-06 09:29 CEST] #118 verified (gates green on rebased branch); landing
[2026-10-06 09:29 CEST] #118: push lock acquired
[2026-10-06 09:29 CEST] #118 landed on origin/main and closed`

function kindsOf(events, ticket) {
  return events.filter((event) => event.ticket === ticket).map((event) => event.kind)
}

describe('ticket phases: loop driver log', () => {
  it('reads a driver stamp in the zone it names', () => {
    expect(parseLoopStamp('2026-10-06 13:47 CEST')).toBe(Date.parse('2026-10-06T11:47:00Z'))
    expect(parseLoopStamp('2026-12-01 09:05 CET')).toBe(Date.parse('2026-12-01T08:05:00Z'))
    expect(parseLoopStamp('2026-10-06 13:47 XYZ')).toBeNull()
  })

  it('reads the tier, the end of the gates and the landing of a build loop ticket', () => {
    const events = parseDriverLog(BUILD_LOOP)
    expect(events.filter((event) => event.ticket === 133)).toEqual([
      {
        ticket: 133,
        at: Date.parse('2026-10-06T11:47:00Z'),
        kind: 'tier',
        tier: 'hard',
        model: 'opus',
      },
      { ticket: 133, at: Date.parse('2026-10-06T13:10:00Z'), kind: 'gates-end' },
      { ticket: 133, at: Date.parse('2026-10-06T13:10:00Z'), kind: 'landing-start' },
      { ticket: 133, at: Date.parse('2026-10-06T13:10:00Z'), kind: 'landing-start' },
    ])
  })

  it('ends a landing attempt at a failed rebase or push and starts one at a recovery', () => {
    const events = parseDriverLog(BUILD_LOOP)
    expect(kindsOf(events, 134)).toEqual([
      'landing-stop',
      'gates-end',
      'landing-start',
      'landing-stop',
    ])
    expect(kindsOf(events, 135)).toEqual(['landing-start'])
  })

  it('reads the perf loop phrasing the same way', () => {
    expect(parseDriverLog(PERF_LOOP)).toEqual([
      {
        ticket: 118,
        at: Date.parse('2026-10-06T06:41:00Z'),
        kind: 'tier',
        tier: 'easy',
        model: 'opus',
      },
      { ticket: 118, at: Date.parse('2026-10-06T07:29:00Z'), kind: 'gates-end' },
      { ticket: 118, at: Date.parse('2026-10-06T07:29:00Z'), kind: 'landing-start' },
      { ticket: 118, at: Date.parse('2026-10-06T07:29:00Z'), kind: 'landing-start' },
    ])
  })
})
