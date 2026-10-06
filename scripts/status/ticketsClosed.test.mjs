import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildTicketsClosedOverTime, daysFromTo } from './ticketsClosed.mjs'

const HOUR = 3600
// The two `gh issue list --state closed --label <build|perf> --json number,title,state,closedAt,
// labels` outputs of 2026-10-06, labels trimmed to their names.
const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/closed-tickets.json', import.meta.url), 'utf8'),
)
const CLOSED_TICKETS = Object.values(FIXTURE).flat()

function issue(number, labels, closedAt, state = 'CLOSED') {
  return {
    number,
    title: `Issue ${number}`,
    state,
    closedAt,
    labels: labels.map((name) => ({ name })),
  }
}

function measured(ticket, closed, claimedToDoneS) {
  return { ticket, closed, claimedToDoneS }
}

function build(issues, measuredTickets = [], today = '2026-10-06') {
  return buildTicketsClosedOverTime({ issues, measuredTickets, today })
}

describe('tickets closed over time', () => {
  it('counts each day as gh issue list --state closed does for build and perf tickets', () => {
    const { days, closedCount } = build(CLOSED_TICKETS)
    expect(days.map((day) => [day.day, day.count, day.cumulative])).toEqual([
      ['2026-10-04', 5, 5],
      ['2026-10-05', 35, 40],
      ['2026-10-06', 34, 74],
    ])
    expect(closedCount).toBe(74)
  })

  it('leaves out open issues and closed issues that are neither build nor perf tickets', () => {
    const { days } = build([
      issue(1, ['build'], '2026-10-05T10:00:00Z'),
      issue(2, ['perf'], '2026-10-05T11:00:00Z'),
      issue(3, ['design'], '2026-10-05T12:00:00Z'),
      issue(4, ['build'], null, 'OPEN'),
    ])
    expect(days[0]).toMatchObject({ day: '2026-10-05', count: 2 })
  })

  it('runs from the first close to today, with the days without a close at zero', () => {
    const { days } = build([issue(1, ['build'], '2026-10-03T23:59:00Z')], [], '2026-10-06')
    expect(days.map((day) => [day.day, day.count, day.cumulative])).toEqual([
      ['2026-10-03', 1, 1],
      ['2026-10-04', 0, 1],
      ['2026-10-05', 0, 1],
      ['2026-10-06', 0, 1],
    ])
  })

  it('lists the titles of the tickets closed that day for the hover', () => {
    const { days } = build([
      issue(9, ['build'], '2026-10-06T10:00:00Z'),
      issue(7, ['perf'], '2026-10-06T09:00:00Z'),
    ])
    expect(days[0].tickets).toEqual([
      { number: 7, title: 'Issue 7' },
      { number: 9, title: 'Issue 9' },
    ])
  })

  it('takes the median claimed-to-done time of the measured tickets closed each day', () => {
    const { days } = build(
      [issue(1, ['build'], '2026-10-05T10:00:00Z')],
      [
        measured(1, '2026-10-05T10:00:00Z', HOUR),
        measured(2, '2026-10-05T20:00:00Z', 3 * HOUR),
        measured(3, '2026-10-06T08:00:00Z', null),
      ],
    )
    expect(days[0]).toMatchObject({ measuredCount: 2, medianClaimedToDoneS: 2 * HOUR })
    expect(days[1]).toMatchObject({ measuredCount: 0, medianClaimedToDoneS: null })
  })

  it('has no days before the first close', () => {
    expect(build([]).days).toEqual([])
  })

  it('lists every UTC day between two days', () => {
    expect(daysFromTo('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])
  })
})
