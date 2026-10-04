import { describe, expect, it } from 'vitest'
import { formatNdjsonLine, parseNdjson } from './ndjson'
import type { RunEvent } from './runEvent'

const event: RunEvent = {
  seq: 3,
  timestamp: 12.5,
  runId: 'run_test',
  playerId: 'player_1',
  planet: 1,
  planetSeed: 7,
  depth: 0.1,
  event: 'money_earned',
  data: { amount: 1e100 },
}

describe('ndjson', () => {
  it('writes one event as exactly one line', () => {
    const line = formatNdjsonLine(event)
    expect(line.endsWith('\n')).toBe(true)
    expect(line.slice(0, -1)).not.toContain('\n')
  })

  it('reads back what it wrote, including a 1e100 amount', () => {
    const text = formatNdjsonLine(event) + formatNdjsonLine({ ...event, seq: 4 })
    expect(parseNdjson(text)).toEqual([event, { ...event, seq: 4 }])
  })

  it('skips a blank trailing line', () => {
    expect(parseNdjson('\n\n')).toEqual([])
  })
})
