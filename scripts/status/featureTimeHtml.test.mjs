import { describe, expect, it } from 'vitest'
import { PHASE_CATEGORIES } from '../metrics/phaseCategories.mjs'
import { annotateFeatures } from './features.mjs'
import {
  featureTimeBarHtml,
  featureTimeTooltip,
  renderFeatureTimeFailure,
  renderFeatureTimeOverview,
  withFeatureTimeBars,
} from './featureTimeHtml.mjs'
import { phaseLegendHtml } from './ticketTimeOverviewHtml.mjs'

const REPO = 'bjor2/steampunk-miner'
const HOUR = 3600

function feature(title, issues) {
  return { title, description: 'A feature.', status: 'built', issues }
}

function area(title, children) {
  return { group: true, title, description: 'An area.', children }
}

function closedIssue(number, children = []) {
  return { number, title: `Issue ${number}`, state: 'CLOSED', labels: [], children }
}

function measured(ticket, totals, cycleS = HOUR) {
  return { ticket, totals, cycleS }
}

const DOC = {
  title: 'Game',
  description: 'A game.',
  areas: [
    area('Vehicle & <Movement>', [feature('Drill', [10, 11, 12]), feature('Map', [])]),
    area('Economy', [feature('Shop', [7])]),
  ],
}
const ISSUES = [10, 11, 12, 7].map((number) => closedIssue(number))
const MEASURED = [
  measured(10, { developing: HOUR, testing: HOUR }),
  measured(11, { developing: 2 * HOUR }, 3 * HOUR),
]

function annotated() {
  return annotateFeatures(DOC, ISSUES, MEASURED)
}

describe('feature time html', () => {
  it('draws a feature bar in the fixed colours with its total and its unmeasured count', () => {
    const drill = annotated().areas[0].children[0]
    const html = featureTimeBarHtml(drill.time, PHASE_CATEGORIES)
    const colours = [...html.matchAll(/<rect [^>]*fill="(#[0-9a-f]{6})"/g)].map((m) => m[1])
    const colourOf = (id) => PHASE_CATEGORIES.find((category) => category.id === id).colour
    expect(colours).toEqual([colourOf('developing'), colourOf('testing')])
    expect(html).toContain('<span class="ft-time-total">4.0 h</span>')
    expect(html).toContain('1 not measured')
  })

  it('lists the measured time, counts, median cycle and per-category hours in the tooltip', () => {
    const drill = annotated().areas[0].children[0]
    expect(featureTimeTooltip(drill.time, PHASE_CATEGORIES)).toEqual([
      'Measured: 4.0 h over 2 of 3 tickets',
      '1 not measured (no metrics file)',
      'Median ticket cycle: 2.0 h',
      'Developing: 3.0 h (75%)',
      'Testing: 1.0 h (25%)',
    ])
  })

  it('shows a feature with only unmeasured tickets as a count, never as zero time', () => {
    const shop = annotated().areas[1].children[0]
    const html = featureTimeBarHtml(shop.time, PHASE_CATEGORIES)
    expect(html).toContain('1 not measured')
    expect(html).not.toContain('<svg')
    expect(html).not.toContain('0 min')
  })

  it('draws nothing for a feature that reaches no ticket', () => {
    const map = annotated().areas[0].children[1]
    expect(featureTimeBarHtml(map.time, PHASE_CATEGORIES)).toBe('')
  })

  it('puts a bar on every feature row and group heading of the tree', () => {
    const areas = withFeatureTimeBars(annotated().areas, PHASE_CATEGORIES)
    expect(areas[0].timeHtml).toContain('<span class="ft-time-total">4.0 h</span>')
    expect(areas[0].children[0].timeHtml).toContain('class="ft-time"')
    expect(areas[1].timeHtml).toContain('1 not measured')
  })

  it('compares the feature areas above the tree under the same legend as the issue tab', () => {
    const features = annotated()
    const html = renderFeatureTimeOverview(features, PHASE_CATEGORIES, REPO)
    expect(html).toContain(phaseLegendHtml(PHASE_CATEGORIES, features.time.totals))
    expect(html.match(/<div class="ft-time-row" /g)).toHaveLength(2)
    expect(html).toContain('data-area="Vehicle &amp; &lt;Movement&gt;"')
    expect(html).toContain('4.0 h · 2 of 3 tickets measured')
    expect(html).toContain('1 ticket, none measured')
    expect(html).not.toContain('0 min')
  })

  it('shows the error in place of the chart when the roll-up fails', () => {
    const html = renderFeatureTimeFailure('features.json: <broken>')
    expect(html).toContain('data-error="1"')
    expect(html).toContain('&lt;broken&gt;')
  })
})
