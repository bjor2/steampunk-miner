import { describe, expect, it } from 'vitest'
import { serializeTicketRecord, shareOfSessionTime } from './ticketFile.mjs'

const RECORD = {
  schema: 1,
  ticket: 7,
  title: 'Build X: "quoted"',
  tier: 'hard',
  model: 'claude-opus-5-5',
  created: '2026-10-06T10:00:00.000Z',
  closed: '2026-10-06T11:00:00.000Z',
  segments: [
    {
      category: 'idle',
      start: '2026-10-06T10:00:00.000Z',
      end: '2026-10-06T10:30:00.000Z',
      attempt: 0,
      tier: null,
      model: null,
      source: 'derived',
    },
    {
      category: 'testing',
      start: '2026-10-06T10:30:00.000Z',
      end: '2026-10-06T11:00:00.000Z',
      attempt: 1,
      tier: 'hard',
      model: 'claude-opus-5-5',
      source: 'transcript',
    },
  ],
  totals: { idle: 1800, testing: 1800, other: 0 },
  lead_time_s: 3600,
  cycle_time_s: 1800,
  backfilled: false,
}

describe('ticket phases: ticket file', () => {
  it('writes text that reads back as the same record, one segment per line', () => {
    const text = serializeTicketRecord(RECORD)
    expect(JSON.parse(text)).toEqual(RECORD)
    expect(text.split('\n').filter((line) => line.startsWith('    {"category"'))).toHaveLength(2)
    expect(text.endsWith('}\n')).toBe(true)
  })

  it('writes the same bytes for the same record', () => {
    expect(serializeTicketRecord(structuredClone(RECORD))).toBe(serializeTicketRecord(RECORD))
  })

  it('measures a category against session time only, never idle or waiting', () => {
    const records = [
      { totals: { idle: 9000, context: 300, testing: 600, other: 100 } },
      { totals: { blocked: 500, developing: 900, other: 100 } },
    ]
    expect(shareOfSessionTime(records, 'other')).toBeCloseTo(200 / 2000)
    expect(shareOfSessionTime([{ totals: { idle: 5 } }], 'other')).toBeNull()
  })
})
