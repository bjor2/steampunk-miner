import { describe, expect, it } from 'vitest'
import { CATEGORY_IDS } from '../metrics/phaseCategories.mjs'
import { buildTicketTimeOverview } from './ticketTimeOverview.mjs'

const REPO = 'bjor2/steampunk-miner'

// The totals laid back to back so they end at the close, claimed at the first one; `preClaim`
// seconds of blocked time come before the claim, `claimed: false` leaves the claim out.
function segmentsOf(closed, totals, preClaim) {
  let end = Date.parse(closed)
  const segments = Object.entries(totals).map(([category, seconds]) => {
    const segment = { category, start: new Date(end - seconds * 1000), end: new Date(end) }
    end -= seconds * 1000
    return segment
  })
  if (preClaim) {
    segments.push({
      category: 'blocked',
      start: new Date(end - preClaim * 1000),
      end: new Date(end),
    })
  }
  return { segments: segments.reverse(), claimedMs: end }
}

function ticketFile(
  ticket,
  closed,
  totals,
  { lead = 3600, cycle = 1800, preClaim = 0, claimed = true } = {},
) {
  const { segments, claimedMs } = segmentsOf(closed, totals, preClaim)
  const record = {
    schema: 1,
    ticket,
    title: `Ticket ${ticket}`,
    tier: 'hard',
    model: 'claude-opus-5-5',
    created: '2026-10-05T00:00:00Z',
    closed,
    segments,
    totals: preClaim ? { ...totals, blocked: (totals.blocked ?? 0) + preClaim } : totals,
    lead_time_s: lead,
    cycle_time_s: cycle,
    claimed: claimed ? new Date(claimedMs).toISOString() : null,
    claimed_to_done_s: claimed ? (Date.parse(closed) - claimedMs) / 1000 : null,
    backfilled: true,
  }
  return { name: `${ticket}.json`, text: JSON.stringify(record) }
}

function build(files) {
  return buildTicketTimeOverview({ files, repo: REPO })
}

describe('ticket time overview', () => {
  it('lists the most recently closed tickets first, with a link to each issue', () => {
    const model = build([
      ticketFile(5, '2026-10-05T10:00:00Z', { testing: 60 }),
      ticketFile(9, '2026-10-06T10:00:00Z', { developing: 30 }),
    ])
    expect(model.recent.map((ticket) => ticket.ticket)).toEqual([9, 5])
    expect(model.recent[0].url).toBe('https://github.com/bjor2/steampunk-miner/issues/9')
  })

  it('keeps only the last 30 closed tickets in the per-ticket bars', () => {
    const files = Array.from({ length: 35 }, (_, index) =>
      ticketFile(index + 1, new Date(Date.UTC(2026, 9, 6, 0, index)).toISOString(), { idle: 1 }),
    )
    const model = build(files)
    expect(model.recent).toHaveLength(30)
    expect(model.recent[0].ticket).toBe(35)
    expect(model.ticketCount).toBe(35)
  })

  it('gives every ticket and every day a total for all ten categories, zeros included', () => {
    const model = build([ticketFile(5, '2026-10-05T10:00:00Z', { testing: 60 })])
    expect(Object.keys(model.recent[0].totals)).toEqual(CATEGORY_IDS)
    expect(Object.keys(model.days[0].totals)).toEqual(CATEGORY_IDS)
    expect(model.categories.map((category) => category.id)).toEqual(CATEGORY_IDS)
    expect(model.categoryTotals).toMatchObject({ testing: 60, blocked: 0 })
  })

  it('sums each close day and takes the median cycle and lead time of its tickets', () => {
    const model = build([
      ticketFile(1, '2026-10-05T23:00:00Z', { testing: 100 }, { lead: 1000, cycle: 100 }),
      ticketFile(2, '2026-10-06T01:00:00Z', { testing: 50, idle: 10 }, { lead: 3000, cycle: 300 }),
      ticketFile(3, '2026-10-06T05:00:00Z', { developing: 20 }, { lead: 5000, cycle: null }),
      ticketFile(4, '2026-10-06T09:00:00Z', { idle: 5 }, { lead: 2000, cycle: 500 }),
    ])
    expect(model.days.map((day) => day.day)).toEqual(['2026-10-05', '2026-10-06'])
    const [, sixth] = model.days
    expect(sixth).toMatchObject({ ticketCount: 3, medianLeadS: 3000, medianCycleS: 400 })
    expect(sixth.totals).toMatchObject({ testing: 50, idle: 15, developing: 20 })
  })

  it('reports a file it cannot read and draws the rest', () => {
    const model = build([
      { name: 'broken.json', text: '{nope' },
      { name: '8.json', text: JSON.stringify({ schema: 2, ticket: 8 }) },
      ticketFile(5, '2026-10-05T10:00:00Z', { testing: 60 }),
    ])
    expect(model.recent.map((ticket) => ticket.ticket)).toEqual([5])
    expect(model.problems).toEqual([
      'broken.json: invalid JSON, skipped',
      '8.json: schema 2 is not 1, skipped',
    ])
  })

  it('builds an empty overview from no files', () => {
    const model = build([])
    expect(model).toMatchObject({ ticketCount: 0, recent: [], days: [], problems: [] })
  })

  it('cuts each ticket to its claimed-to-done window for the Features tab', () => {
    const record = {
      schema: 1,
      ticket: 5,
      title: 'Ticket 5',
      created: '2026-10-06T08:00:00Z',
      closed: '2026-10-06T11:00:00Z',
      segments: [
        { category: 'blocked', start: '2026-10-06T08:00:00Z', end: '2026-10-06T09:00:00Z' },
        { category: 'developing', start: '2026-10-06T09:00:00Z', end: '2026-10-06T10:00:00Z' },
        { category: 'planner_wait', start: '2026-10-06T10:00:00Z', end: '2026-10-06T11:00:00Z' },
      ],
      totals: { blocked: 3600, developing: 3600, planner_wait: 3600 },
      claimed: '2026-10-06T09:00:00Z',
      claimed_to_done_s: 7200,
    }
    const [ticket] = build([{ name: '5.json', text: JSON.stringify(record) }]).tickets
    expect(ticket.claimed).toBe('2026-10-06T09:00:00Z')
    expect(ticket.claimedToDoneS).toBe(7200)
    expect(ticket.claimedTotals).toMatchObject({ blocked: 0, developing: 3600, planner_wait: 3600 })
    expect(ticket.totals.blocked).toBe(3600)
  })

  it('gives a ticket that was never claimed no window', () => {
    const [ticket] = build([
      ticketFile(6, '2026-10-06T10:00:00Z', { idle: 60 }, { claimed: false }),
    ]).tickets
    expect(ticket.claimed).toBeNull()
    expect(ticket.claimedTotals).toBeNull()
  })

  it('drops days of blocked time before the claim from the totals of the Issue trees tab', () => {
    const threeDays = 3 * 24 * 3600
    const model = build([
      ticketFile(
        7,
        '2026-10-06T10:00:00Z',
        { developing: 1800, blocked: 600 },
        { preClaim: threeDays },
      ),
    ])
    expect(model.recent[0].claimedTotals).toMatchObject({ developing: 1800, blocked: 600 })
    expect(model.categoryTotals).toMatchObject({ developing: 1800, blocked: 600 })
    expect(model.days[0].totals).toMatchObject({ developing: 1800, blocked: 600 })
  })

  it('leaves a ticket with no claim out of the totals and counts it as unclaimed', () => {
    const model = build([
      ticketFile(5, '2026-10-06T09:00:00Z', { testing: 60 }),
      ticketFile(6, '2026-10-06T10:00:00Z', { blocked: 9000 }, { claimed: false }),
    ])
    expect(model.categoryTotals).toMatchObject({ testing: 60, blocked: 0 })
    expect(model.days[0]).toMatchObject({ ticketCount: 2, unclaimedCount: 1 })
    expect(model.unclaimedCount).toBe(1)
  })
})
