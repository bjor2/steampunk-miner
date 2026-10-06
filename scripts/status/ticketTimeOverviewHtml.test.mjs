import { describe, expect, it } from 'vitest'
import { PHASE_CATEGORIES } from '../metrics/phaseCategories.mjs'
import { buildTicketTimeOverview } from './ticketTimeOverview.mjs'
import {
  formatDuration,
  renderTicketTimeFailure,
  renderTicketTimeOverview,
} from './ticketTimeOverviewHtml.mjs'

const REPO = 'bjor2/steampunk-miner'

const DAY_S = 24 * 3600

// The totals as one claimed-to-done run ending at the close, after `preClaim` seconds blocked;
// `claimed: false` is an old backfill with no claim.
function segmentsOf(closed, totals, preClaim) {
  let end = Date.parse(closed)
  const segments = Object.entries(totals).map(([category, seconds]) => {
    const segment = { category, start: new Date(end - seconds * 1000), end: new Date(end) }
    end -= seconds * 1000
    return segment
  })
  const block = { category: 'blocked', start: new Date(end - preClaim * 1000), end: new Date(end) }
  return { segments: [...segments.reverse(), ...(preClaim ? [block] : [])], claimedMs: end }
}

function ticketFile(
  ticket,
  closed,
  totals,
  { title = `Ticket ${ticket}`, preClaim = 0, claimed = true } = {},
) {
  const { segments, claimedMs } = segmentsOf(closed, totals, preClaim)
  return {
    name: `${ticket}.json`,
    text: JSON.stringify({
      schema: 1,
      ticket,
      title,
      tier: 'hard',
      model: 'claude-opus-5-5',
      created: '2026-10-01T00:00:00Z',
      closed,
      segments,
      totals,
      lead_time_s: 7200,
      cycle_time_s: 1800,
      claimed: claimed ? new Date(claimedMs).toISOString() : null,
      claimed_to_done_s: claimed ? (Date.parse(closed) - claimedMs) / 1000 : null,
      backfilled: true,
    }),
  }
}

function rowOf(html, ticket) {
  const start = html.indexOf(`data-ticket="${ticket}"`)
  return html.slice(start, html.indexOf('</div>', start))
}

function render(files) {
  return renderTicketTimeOverview(buildTicketTimeOverview({ files, repo: REPO }))
}

const FILES = [
  ticketFile(133, '2026-10-06T13:10:52Z', { blocked: 4975, testing: 3719, idle: 1067 }),
  ticketFile(
    118,
    '2026-10-06T07:29:48Z',
    { developing: 600, gates: 300 },
    { title: 'Perf 9: <Dispose> & co' },
  ),
  ticketFile(85, '2026-10-05T23:15:29Z', { context: 300, landing: 60 }),
]

describe('ticket time overview html', () => {
  it('renders the section with one linked stacked bar per recently closed ticket', () => {
    const html = render(FILES)
    expect(html).toContain('<section class="panel" id="ticket-time-panel" data-tickets="3">')
    expect(html).toContain('<h2>Where the time goes</h2>')
    expect(html.match(/<div class="tt-row" data-ticket="\d+">/g)).toHaveLength(3)
    expect(html).toContain('href="https://github.com/bjor2/steampunk-miner/issues/133"')
    expect(html.indexOf('data-ticket="133"')).toBeLessThan(html.indexOf('data-ticket="85"'))
  })

  it('draws each category in its one fixed colour, only where it has time', () => {
    const html = render(FILES)
    const row = html.slice(html.indexOf('data-ticket="133"'), html.indexOf('data-ticket="118"'))
    const colours = [...row.matchAll(/<rect [^>]*fill="(#[0-9a-f]{6})"/g)].map((m) => m[1])
    const colourOf = (id) => PHASE_CATEGORIES.find((category) => category.id === id).colour
    expect(colours).toEqual([colourOf('blocked'), colourOf('idle'), colourOf('testing')])
  })

  it('lists every category in the legend, even one with no time', () => {
    const html = render(FILES)
    for (const category of PHASE_CATEGORIES) {
      expect(html).toContain(`<li data-category="${category.id}">`)
    }
    expect(html).toContain('Waiting on planners <span class="muted">0 min · 0%</span>')
  })

  it('draws one stacked column per close day and both completion lines', () => {
    const html = render(FILES)
    expect(html.match(/<g data-day="[\d-]+">/g)).toEqual([
      '<g data-day="2026-10-05">',
      '<g data-day="2026-10-06">',
    ])
    expect(html.match(/<polyline class="tt-line-lead"/g)).toHaveLength(1)
    expect(html.match(/<circle class="tt-line-cycle"/g)).toHaveLength(2)
  })

  it('draws a ticket blocked for days before its claim from the claim only', () => {
    const html = render([
      ticketFile(
        150,
        '2026-10-06T10:00:00Z',
        { developing: 1800, blocked: 600 },
        { preClaim: 3 * DAY_S },
      ),
    ])
    const row = rowOf(html, 150)
    expect(row).toContain('<title>Blocked: 10 min (25%)</title>')
    expect(row).toContain('<title>Developing: 30 min (75%)</title>')
    expect(row).toContain('title="claimed → done">40 min')
    expect(html).toContain('Blocked <span class="muted">10 min · 25%</span>')
  })

  it('says "claimed → done" in the caption of the bars and the legend', () => {
    const html = render(FILES)
    expect(html).toContain('Each bar is the ticket from its claim to its close (claimed → done)')
    expect(html).toContain('claimed → done only')
  })

  it('shows a ticket with no claim as no claim data rather than as a bar', () => {
    const html = render([
      ticketFile(60, '2026-10-05T10:00:00Z', { blocked: 9000 }, { claimed: false }),
      ticketFile(61, '2026-10-05T11:00:00Z', { testing: 600 }),
    ])
    const row = rowOf(html, 60)
    expect(row).toContain('no claim data')
    expect(row).not.toContain('<rect')
    expect(html).toContain('Blocked <span class="muted">0 min · 0%</span>')
  })

  it('escapes ticket titles', () => {
    const html = render(FILES)
    expect(html).toContain('Perf 9: &lt;Dispose&gt; &amp; co')
    expect(html).not.toContain('<Dispose>')
  })

  it('says so when no ticket has been recorded, and shows a build failure in place', () => {
    expect(render([])).toContain('No ticket phases recorded yet.')
    expect(renderTicketTimeFailure('boom <x>')).toContain('failed to build: boom &lt;x&gt;')
  })

  it('formats durations as minutes under an hour and hours above', () => {
    expect(formatDuration(1500)).toBe('25 min')
    expect(formatDuration(11034)).toBe('3.1 h')
    expect(formatDuration(null)).toBe('—')
  })
})
