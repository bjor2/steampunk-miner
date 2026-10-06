import { describe, expect, it } from 'vitest'
import { buildTicketsClosedOverTime } from './ticketsClosed.mjs'
import {
  closedDayTooltip,
  renderTicketsClosedFailure,
  renderTicketsClosedOverTime,
} from './ticketsClosedHtml.mjs'

const HOUR = 3600

function issue(number, title, closedAt) {
  return { number, title, state: 'CLOSED', closedAt, labels: [{ name: 'build' }] }
}

function model() {
  return buildTicketsClosedOverTime({
    issues: [
      issue(1, 'Build 1: <seam>', '2026-10-04T10:00:00Z'),
      issue(2, 'Build 2: money', '2026-10-06T10:00:00Z'),
      issue(3, 'Build 3: drill', '2026-10-06T11:00:00Z'),
    ],
    measuredTickets: [
      { ticket: 2, closed: '2026-10-06T10:00:00Z', claimedToDoneS: HOUR },
      { ticket: 3, closed: '2026-10-06T11:00:00Z', claimedToDoneS: 2 * HOUR },
    ],
    today: '2026-10-06',
  })
}

describe('tickets closed over time html', () => {
  it('draws one bar per day from the first close to today, a zero day included', () => {
    const html = renderTicketsClosedOverTime(model())
    const days = [...html.matchAll(/<g class="tc-day" data-day="([^"]+)" data-count="(\d+)"/g)]
    expect(days.map((m) => [m[1], Number(m[2])])).toEqual([
      ['2026-10-04', 1],
      ['2026-10-05', 0],
      ['2026-10-06', 2],
    ])
  })

  it('draws the running total as a line over the bars', () => {
    const html = renderTicketsClosedOverTime(model())
    expect(
      html.match(/<polyline class="tc-cumulative"[^>]*points="([^"]+)"/)[1].split(' '),
    ).toHaveLength(3)
    expect(html).toContain('2026-10-06 · 3 closed in all')
  })

  it('gives each day a hover with the date, the count and the ticket titles', () => {
    const [, , lastDay] = model().days
    expect(closedDayTooltip(lastDay)).toEqual([
      '2026-10-06 · 2 closed (3 in all)',
      '#2 Build 2: money',
      '#3 Build 3: drill',
    ])
    expect(renderTicketsClosedOverTime(model())).toContain('#1 Build 1: &lt;seam&gt;')
  })

  it('draws the median claimed-to-done time only on days with a measured ticket', () => {
    const html = renderTicketsClosedOverTime(model())
    const points = html.match(/<polyline class="tc-median"[^>]*points="([^"]*)"/)[1]
    expect(points.split(' ')).toHaveLength(1)
    expect(html).toContain('2026-10-06 · median claimed to done 1.5 h (2 measured tickets)')
  })

  it('says so when no ticket has closed yet', () => {
    const empty = buildTicketsClosedOverTime({
      issues: [],
      measuredTickets: [],
      today: '2026-10-06',
    })
    expect(renderTicketsClosedOverTime(empty)).toContain('No build or perf ticket closed yet.')
  })

  it('shows the error in place of the chart when the model fails', () => {
    const html = renderTicketsClosedFailure('issues: <broken>')
    expect(html).toContain('data-error="1"')
    expect(html).toContain('&lt;broken&gt;')
  })
})
