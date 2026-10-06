import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bucketCountsOf } from './issueBuckets.mjs'
import { loopClaimsOf, loopFactsOf } from './issueClaims.mjs'
import {
  bucketButtonsHtml,
  elapsedText,
  issueCardHtml,
  issueListHtml,
  issueSearchText,
  osloTimeOf,
  whenText,
} from './issueListHtml.mjs'

const FIXTURE = JSON.parse(
  readFileSync(new URL('./fixtures/issue-buckets.json', import.meta.url), 'utf8'),
)
// 22:03 in Oslo (CEST), 34 minutes after slot C1 took ticket 194.
const NOW = Date.parse('2026-10-06T20:03:00Z') + 3600000
const PHASES = {
  167: { barHtml: '<svg class="tt-bar"></svg>', totalText: '16 min', model: 'claude-opus-5-5' },
}

function pageOf({ loops = FIXTURE.loops, slots = FIXTURE.slots, phases = PHASES } = {}) {
  return {
    repo: 'bjor2/steampunk-miner',
    byNum: new Map(FIXTURE.issues.map((issue) => [issue.number, issue])),
    claims: loopClaimsOf(loops, slots),
    loopFacts: loopFactsOf(loops),
    phases,
    nowMs: NOW,
    expanded: new Set(),
  }
}

function cardOf(number, page = pageOf()) {
  return issueCardHtml(
    FIXTURE.issues.find((issue) => issue.number === number),
    page,
  )
}

describe('issue list times', () => {
  it('shows a time on the same Oslo day as its clock, an older one with its date', () => {
    expect(osloTimeOf('2026-10-06T20:29:00Z', NOW)).toBe('22:29')
    expect(osloTimeOf('2026-10-05T19:12:00Z', NOW)).toBe('5 Oct 21:12')
  })

  it('reads summer and winter time in Oslo whatever the reader zone', () => {
    const january = Date.parse('2026-01-15T12:00:00Z')
    expect(osloTimeOf('2026-01-15T08:00:00Z', january)).toBe('09:00')
  })

  it('says how long ago in minutes, hours and minutes, or days and hours', () => {
    expect(elapsedText('2026-10-06T21:02:30Z', NOW)).toBe('just now')
    expect(elapsedText('2026-10-06T20:29:00Z', NOW)).toBe('34 min ago')
    expect(elapsedText('2026-10-06T18:58:00Z', NOW)).toBe('2 h 5 min ago')
    expect(elapsedText('2026-10-06T19:03:00Z', NOW)).toBe('2 h ago')
    expect(elapsedText('2026-10-03T17:03:00Z', NOW)).toBe('3 d 4 h ago')
  })

  it('joins the Oslo time and the elapsed time', () => {
    expect(whenText('2026-10-06T20:29:00Z', NOW)).toBe('22:29, 34 min ago')
  })
})

describe('issue list cards', () => {
  it('shows an ongoing issue its loop claim time as started time and elapsed time', () => {
    expect(cardOf(194)).toContain('started <time datetime="2026-10-06T22:29:00+02:00"')
    expect(cardOf(194)).toContain('>22:29, 34 min ago</time>')
  })

  it('falls back to the in-progress label time when no loop reports the issue', () => {
    const card = cardOf(174, pageOf({ loops: null, slots: null }))
    expect(card).toContain('started <time datetime="2026-10-06T19:54:10Z"')
  })

  it('shows no started time on an issue that is not ongoing', () => {
    expect(cardOf(193)).not.toContain('started')
  })

  it('lists the number, title link, type and non-type labels as chips', () => {
    const card = cardOf(174)
    expect(card).toContain('<span class="num">#174</span>')
    expect(card).toContain('href="https://github.com/bjor2/steampunk-miner/issues/174"')
    expect(card).toContain('<span class="itype t-build">build</span>')
    for (const name of ['in-progress', 'tier:hard', 'design']) expect(card).toContain(`>${name}<`)
    expect(card).not.toContain('>build</span></span>')
  })

  it('links the parent plan and the blocked-by and blocking issues', () => {
    const card = cardOf(174)
    expect(card).toContain(
      '<dt>Parent</dt><dd><a href="https://github.com/bjor2/steampunk-miner/issues/90"',
    )
    expect(card).toContain(
      '<dt>Blocking</dt><dd><a href="https://github.com/bjor2/steampunk-miner/issues/175"',
    )
    expect(cardOf(148)).toContain('#146</a> <span class="blk">open</span>')
  })

  it('shows the slots, account, session, attempts and push_pending of a loop worker', () => {
    expect(cardOf(194)).toContain(
      '<dt>Loop</dt><dd>G1 · C1 · Claude Max 1 · opus · high · attempt 1/2</dd>',
    )
    expect(cardOf(174)).toContain(
      'G9 · C4 · Claude Max 1 · fable · high · attempt 1/2 <span class="bad">push_pending</span>',
    )
  })

  it('shows a planner slot without a session', () => {
    expect(cardOf(191)).toContain('<dt>Loop</dt><dd>G10 · planner</dd>')
  })

  it('shows the close time and reason, and the phase bar with its total', () => {
    const card = cardOf(167)
    expect(card).toContain('closed <time datetime="2026-10-06T20:11:24Z"')
    expect(card).toContain('<dt>Closed</dt><dd><time')
    expect(card).toContain(' · completed</dd>')
    expect(card).toContain('<span class="iss-phase"><svg class="tt-bar"></svg></span> 16 min')
    expect(cardOf(120)).toContain(' · not planned</dd>')
  })

  it('leaves out every field it has no data for', () => {
    const card = cardOf(193, pageOf({ loops: null, slots: null, phases: null }))
    for (const name of [
      'Parent</dt><dd></dd>',
      'Blocked by',
      'Blocking',
      'Closed',
      'Loop',
      'Time',
    ]) {
      expect(card).not.toContain(`<dt>${name}`)
    }
    expect(card).not.toMatch(/undefined|null|NaN/)
  })

  it('keeps a card the reader expanded open on the next render', () => {
    const page = { ...pageOf(), expanded: new Set([194]) }
    expect(cardOf(194, page)).toContain('data-n="194" data-search=')
    expect(cardOf(194, page)).toMatch(/^<details class="iss" [^>]*open>/)
    expect(cardOf(193, page)).not.toMatch(/^<details[^>]*open>/)
  })

  it('lets the search box match the type, labels, assignees and loop slot', () => {
    const issue = { ...FIXTURE.issues.find((i) => i.number === 194), assignees: ['bjor2'] }
    const search = issueSearchText(issue, pageOf().claims.get(194))
    for (const word of ['#194', 'build', 'tier:hard', 'bjor2', 'g1 · c1']) {
      expect(search).toContain(word)
    }
  })

  it('says so when a filter has no issues', () => {
    expect(issueListHtml([], pageOf())).toContain('No issues in this filter.')
  })

  it('escapes titles', () => {
    const issue = { ...FIXTURE.issues[2], title: '<b>x</b> & "y"' }
    expect(issueCardHtml(issue, pageOf())).toContain('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;')
  })
})

describe('issue filter buttons', () => {
  it('shows every bucket with its count and presses the active one', () => {
    const counts = bucketCountsOf(FIXTURE.issues, pageOf())
    const html = bucketButtonsHtml(counts, 'ongoing')
    expect(html.match(/<button/g)).toHaveLength(5)
    expect(html).toContain('data-bucket="ongoing" aria-pressed="true">Ongoing <b>3</b>')
    expect(html).toContain('data-bucket="open" aria-pressed="false">Open <b>14</b>')
    expect(html).toContain('Ready to begin <b>3</b>')
    expect(html).toContain('Planned <b>8</b>')
    expect(html).toContain('Closed <b>2</b>')
  })
})
