import { describe, expect, it } from 'vitest'
import { PHASE_CATEGORIES } from '../metrics/phaseCategories.mjs'
import { buildTicketTimeOverview } from './ticketTimeOverview.mjs'
import {
  formatDuration,
  renderTicketTimeFailure,
  renderTicketTimeOverview,
} from './ticketTimeOverviewHtml.mjs'

const REPO = 'bjor2/steampunk-miner'

function ticketFile(ticket, closed, totals, title = `Ticket ${ticket}`) {
  return {
    name: `${ticket}.json`,
    text: JSON.stringify({
      schema: 1,
      ticket,
      title,
      tier: 'hard',
      model: 'claude-opus-5-5',
      created: '2026-10-05T00:00:00Z',
      closed,
      segments: [],
      totals,
      lead_time_s: 7200,
      cycle_time_s: 1800,
      backfilled: true,
    }),
  }
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
    'Perf 9: <Dispose> & co',
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
