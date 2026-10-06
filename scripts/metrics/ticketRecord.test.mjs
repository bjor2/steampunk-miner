import { describe, expect, it } from 'vitest'
import { CATEGORY_IDS } from './phaseCategories.mjs'
import { buildTicketRecord, layerWindows } from './ticketRecord.mjs'

const T0 = Date.parse('2026-10-06T10:00:00.000Z')
function at(minutes) {
  return T0 + minutes * 60_000
}
function iso(minutes) {
  return new Date(at(minutes)).toISOString()
}

function session(sessionId, startMin, endMin, segments, model = 'claude-opus-5-5') {
  return {
    sessionId,
    model,
    branch: 'ticket/7',
    start: at(startMin),
    end: at(endMin),
    segments: segments.map(([category, from, to]) => ({ category, start: at(from), end: at(to) })),
  }
}

// Ticket #7: created at 0, blocked 0-10, idle, attempt 1 at 20 (session 20-40, needs-planner
// 40-50), attempt 2 at 60 (session 60-90), gates 90-100, landing 100 until the close at 105.
function ticketSeven(overrides = {}) {
  return {
    issue: {
      number: 7,
      title: 'Build X: a thing',
      createdAt: iso(0),
      closedAt: iso(105),
      labels: ['build', 'tier:hard'],
    },
    attempts: [
      { start: at(20), end: at(40), gatesEnd: null, sessionId: 'a' },
      { start: at(60), end: at(90), gatesEnd: at(100), sessionId: 'b' },
    ],
    sessions: [
      session('a', 20, 40, [
        ['context', 20, 30],
        ['planning', 30, 40],
      ]),
      session('b', 60.5, 90, [
        ['developing', 60.5, 80],
        ['testing', 80, 90],
      ]),
    ],
    driverEvents: [
      { ticket: 7, at: at(19), kind: 'tier', tier: 'easy', model: 'opus' },
      { ticket: 7, at: at(59), kind: 'tier', tier: 'hard', model: 'opus' },
      { ticket: 7, at: at(100), kind: 'gates-end' },
      { ticket: 7, at: at(100), kind: 'landing-start' },
    ],
    githubWindows: [
      { category: 'blocked', start: at(-5), end: at(10), source: 'github' },
      { category: 'planner_wait', start: at(40), end: at(50), source: 'github' },
    ],
    backfilled: true,
    ...overrides,
  }
}

function spans(record) {
  return record.segments.map((s) => [
    s.category,
    (Date.parse(s.start) - T0) / 60_000,
    (Date.parse(s.end) - T0) / 60_000,
  ])
}

describe('ticket phases: layering', () => {
  it('lets the higher-ranked window own an overlap and fills the rest with idle', () => {
    const layered = layerWindows(
      [
        { category: 'blocked', start: at(0), end: at(30), source: 'github', rank: 5 },
        { category: 'testing', start: at(10), end: at(20), source: 'transcript', rank: 0 },
      ],
      at(0),
      at(40),
    )
    expect(
      layered.map((s) => [s.category, (s.start - T0) / 60_000, (s.end - T0) / 60_000]),
    ).toEqual([
      ['blocked', 0, 10],
      ['testing', 10, 20],
      ['blocked', 20, 30],
      ['idle', 30, 40],
    ])
  })
})

describe('ticket phases: ticket record', () => {
  it('splits the whole life of a ticket into one non-overlapping timeline', () => {
    expect(spans(buildTicketRecord(ticketSeven()))).toEqual([
      ['blocked', 0, 10],
      ['idle', 10, 20],
      ['context', 20, 30],
      ['planning', 30, 40],
      ['planner_wait', 40, 50],
      ['idle', 50, 60],
      ['other', 60, 60.5],
      ['developing', 60.5, 80],
      ['testing', 80, 90],
      ['gates', 90, 100],
      ['landing', 100, 105],
    ])
  })

  it('totals every category in seconds, zero included, and adds up to the lead time', () => {
    const record = buildTicketRecord(ticketSeven())
    expect(Object.keys(record.totals)).toEqual(CATEGORY_IDS)
    expect(record.totals).toMatchObject({ blocked: 600, idle: 1200, other: 30, landing: 300 })
    const sum = Object.values(record.totals).reduce((a, b) => a + b, 0)
    expect(sum).toBe(record.lead_time_s)
    expect(record.lead_time_s).toBe(105 * 60)
    expect(record.cycle_time_s).toBe(85 * 60)
  })

  it('stamps each segment with its attempt, tier and model', () => {
    const record = buildTicketRecord(ticketSeven())
    const pick = (category) => record.segments.find((s) => s.category === category)
    expect(pick('blocked')).toMatchObject({ attempt: 0, tier: null, model: null, source: 'github' })
    expect(pick('context')).toMatchObject({
      attempt: 1,
      tier: 'easy',
      model: 'claude-opus-5-5',
      source: 'transcript',
    })
    expect(pick('gates')).toMatchObject({ attempt: 2, tier: 'hard', source: 'loop-log' })
    expect(pick('idle')).toMatchObject({ source: 'derived' })
  })

  it('carries the schema fields, the label tier and the last model', () => {
    const record = buildTicketRecord(ticketSeven())
    expect(record).toMatchObject({
      schema: 1,
      ticket: 7,
      title: 'Build X: a thing',
      tier: 'hard',
      model: 'claude-opus-5-5',
      created: iso(0),
      closed: iso(105),
      backfilled: true,
    })
  })

  it('counts a transcript the loop never logged as its own attempt', () => {
    const record = buildTicketRecord(
      ticketSeven({
        attempts: [],
        sessions: [session('m', 30, 45, [['developing', 30, 45]])],
        driverEvents: [],
        githubWindows: [],
      }),
    )
    expect(spans(record)).toEqual([
      ['idle', 0, 30],
      ['developing', 30, 45],
      ['idle', 45, 105],
    ])
    expect(record.segments[1]).toMatchObject({ attempt: 1, tier: null })
    expect(record.cycle_time_s).toBe(75 * 60)
  })

  it('ends the gates at the driver verdict when the gate files are gone', () => {
    const record = buildTicketRecord(
      ticketSeven({
        attempts: [{ start: at(60), end: at(90), gatesEnd: null, sessionId: 'b' }],
        driverEvents: [{ ticket: 7, at: at(95), kind: 'gates-end' }],
      }),
    )
    expect(spans(record).filter(([category]) => category === 'gates')).toEqual([['gates', 90, 95]])
  })

  it('ends a session at its transcript, not at a log file touched later', () => {
    const touched = at(400)
    const record = buildTicketRecord(
      ticketSeven({
        issue: { ...ticketSeven().issue, closedAt: iso(500) },
        attempts: [{ start: at(60), end: touched, gatesEnd: touched, sessionId: 'b' }],
        driverEvents: [{ ticket: 7, at: at(95), kind: 'gates-end' }],
        githubWindows: [],
      }),
    )
    expect(spans(record).slice(-4)).toEqual([
      ['developing', 60.5, 80],
      ['testing', 80, 90],
      ['gates', 90, 96],
      ['idle', 96, 500],
    ])
  })

  it('ends a session with no transcript at the driver exit line', () => {
    const record = buildTicketRecord(
      ticketSeven({
        attempts: [{ start: at(20), end: at(400), gatesEnd: null, sessionId: 'gone' }],
        sessions: [],
        driverEvents: [{ ticket: 7, at: at(30), kind: 'session-exit' }],
        githubWindows: [],
      }),
    )
    expect(spans(record)).toEqual([
      ['idle', 0, 20],
      ['other', 20, 30],
      ['idle', 30, 105],
    ])
  })

  it('waits between attempts as idle when a failed push sends the ticket back', () => {
    const record = buildTicketRecord(
      ticketSeven({
        attempts: [],
        sessions: [session('fix', 70, 80, [['developing', 70, 80]])],
        githubWindows: [],
        driverEvents: [
          { ticket: 7, at: at(60), kind: 'landing-start' },
          { ticket: 7, at: at(62), kind: 'landing-stop' },
          { ticket: 7, at: at(100), kind: 'landing-start' },
        ],
      }),
    )
    expect(spans(record)).toEqual([
      ['idle', 0, 60],
      ['landing', 60, 62],
      ['idle', 62, 70],
      ['developing', 70, 80],
      ['idle', 80, 100],
      ['landing', 100, 105],
    ])
  })

  it('keeps landing after a failed rebase until a hand-land closes the ticket', () => {
    const record = buildTicketRecord(
      ticketSeven({
        attempts: [],
        sessions: [],
        githubWindows: [],
        driverEvents: [
          { ticket: 7, at: at(60), kind: 'landing-start' },
          { ticket: 7, at: at(62), kind: 'landing-stop' },
        ],
      }),
    )
    expect(spans(record)).toEqual([
      ['idle', 0, 60],
      ['landing', 60, 105],
    ])
    expect(record.cycle_time_s).toBeNull()
  })
})
