import { describe, expect, it } from 'vitest'
import { CATEGORY_IDS } from '../metrics/phaseCategories.mjs'
import { featureTimeOf, measuredByNumberOf, subIssuesOfIssues } from './featureTime.mjs'
import { buildTicketTimeOverview } from './ticketTimeOverview.mjs'

const HOUR = 3600

function ticketFile(ticket, totals, cycle = HOUR) {
  const record = {
    schema: 1,
    ticket,
    title: `Ticket ${ticket}`,
    created: '2026-10-05T00:00:00Z',
    closed: '2026-10-06T00:00:00Z',
    segments: [],
    totals,
    lead_time_s: 2 * HOUR,
    cycle_time_s: cycle,
  }
  return { name: `${ticket}.json`, text: JSON.stringify(record) }
}

function issue(number, children = []) {
  return { number, title: `Issue ${number}`, children }
}

// The tickets as build-status hands them over: parsed from committed files and the issue list.
function sourcesOf(files, issues = []) {
  const { tickets } = buildTicketTimeOverview({ files, repo: 'bjor2/steampunk-miner' })
  return { subIssuesOf: subIssuesOfIssues(issues), measuredByNumber: measuredByNumberOf(tickets) }
}

function feature(title, issues) {
  return { title, description: 'A feature.', status: 'built', issues }
}

function group(title, children) {
  return { group: true, title, description: 'A group.', children }
}

describe('feature time roll-up', () => {
  it('sums each category over the measured tickets of a feature', () => {
    const sources = sourcesOf([
      ticketFile(10, { developing: HOUR, testing: 30 }),
      ticketFile(11, { developing: 60, idle: 600 }),
    ])
    const time = featureTimeOf(feature('Drill', [10, 11]), sources)
    expect(time.totals.developing).toBe(HOUR + 60)
    expect(time.totals.testing).toBe(30)
    expect(time.totals.idle).toBe(600)
    expect(time.measuredS).toBe(HOUR + 60 + 30 + 600)
    expect(Object.keys(time.totals)).toEqual(CATEGORY_IDS)
  })

  it('counts a ticket once when a feature reaches it directly and through an umbrella', () => {
    const sources = sourcesOf([ticketFile(10, { developing: HOUR })], [issue(90, [10])])
    const time = featureTimeOf(feature('Drill', [10, 90]), sources)
    expect(time.totals.developing).toBe(HOUR)
    expect(time.ticketCount).toBe(2)
    expect(time.measuredCount).toBe(1)
  })

  it('follows umbrella sub-issues down every level', () => {
    const sources = sourcesOf(
      [ticketFile(12, { testing: HOUR }), ticketFile(13, { gates: 60 })],
      [issue(1, [17]), issue(17, [12, 20]), issue(20, [13])],
    )
    const time = featureTimeOf(feature('Campaign', [1]), sources)
    expect(time.ticketCount).toBe(5)
    expect(time.totals.testing).toBe(HOUR)
    expect(time.totals.gates).toBe(60)
  })

  it('gives a group the union of its children, so a shared ticket counts once', () => {
    const sources = sourcesOf([
      ticketFile(10, { developing: HOUR }),
      ticketFile(11, { testing: HOUR }),
    ])
    const area = group('Vehicle', [
      feature('Drill', [10, 11]),
      group('Energy', [feature('Tank', [10]), feature('Warnings', [11])]),
    ])
    const time = featureTimeOf(area, sources)
    expect(time.ticketCount).toBe(2)
    expect(time.measuredS).toBe(2 * HOUR)
  })

  it('counts tickets with no metrics file as not measured and adds no time for them', () => {
    const sources = sourcesOf([ticketFile(10, { developing: HOUR })])
    const time = featureTimeOf(feature('Drill', [10, 7, 8]), sources)
    expect(time.measuredCount).toBe(1)
    expect(time.unmeasuredCount).toBe(2)
    expect(time.measuredS).toBe(HOUR)
  })

  it('leaves a feature with no measured tickets at no time, with its tickets counted', () => {
    const time = featureTimeOf(feature('Drill', [7, 8]), sourcesOf([]))
    expect(time).toMatchObject({ ticketCount: 2, measuredCount: 0, unmeasuredCount: 2 })
    expect(time.measuredS).toBe(0)
    expect(time.medianCycleS).toBeNull()
  })

  it('gives a feature with no issues no tickets', () => {
    const time = featureTimeOf({ title: 'Map', status: 'built' }, sourcesOf([]))
    expect(time).toMatchObject({ ticketCount: 0, measuredCount: 0, unmeasuredCount: 0 })
    expect(time.measuredS).toBe(0)
  })

  it('shows the median cycle time only from two measured tickets on', () => {
    const sources = sourcesOf([
      ticketFile(10, { developing: 60 }, HOUR),
      ticketFile(11, { developing: 60 }, 3 * HOUR),
      ticketFile(12, { developing: 60 }, 8 * HOUR),
    ])
    expect(featureTimeOf(feature('Drill', [10, 7]), sources).medianCycleS).toBeNull()
    expect(featureTimeOf(feature('Drill', [10, 11]), sources).medianCycleS).toBe(2 * HOUR)
    expect(featureTimeOf(feature('Drill', [10, 11, 12]), sources).medianCycleS).toBe(3 * HOUR)
  })
})
