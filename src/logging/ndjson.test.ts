import { describe, expect, it } from 'vitest'
import { formatNdjsonLine, keepNewestLines, parseNdjson } from './ndjson'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'

const event: RunEvent = {
  v: LOG_SCHEMA_VERSION,
  seq: 3,
  tick: 8120,
  timestamp: 12.5,
  runId: 'run_test',
  playerId: 'player_1',
  planet: 1,
  depthTiles: 73,
  event: 'resource_sold',
  cmd: [8118, 3],
  data: { items: [{ tier: 2, amount: 6 }], value: '1e+100', mode: 'all' },
}

describe('ndjson', () => {
  it('writes one event as exactly one line', () => {
    const line = formatNdjsonLine(event)
    expect(line.endsWith('\n')).toBe(true)
    expect(line.slice(0, -1)).not.toContain('\n')
  })

  it('reads back what it wrote, including a 1e100 value as its canonical string', () => {
    const text = formatNdjsonLine(event) + formatNdjsonLine({ ...event, seq: 4 })
    expect(parseNdjson(text)).toEqual([event, { ...event, seq: 4 }])
  })

  it('skips a blank trailing line', () => {
    expect(parseNdjson('\n\n')).toEqual([])
  })
})

describe('ndjson tail (#117)', () => {
  const lineNumbered = (index: number) => `${String(index).padStart(9, '0')}\n`

  it('keeps only the newest whole lines that fit after far more lines than the cap', () => {
    let tail = ''
    for (let index = 0; index < 10_000; index += 1)
      tail = keepNewestLines(tail + lineNumbered(index), 35)
    expect(tail).toBe('000009997\n000009998\n000009999\n')
  })

  it('keeps text within the cap whole', () => {
    expect(keepNewestLines('{"seq":0}\n{"seq":1}\n', 20)).toBe('{"seq":0}\n{"seq":1}\n')
  })

  it('keeps no part of a line longer than the cap', () => {
    expect(keepNewestLines('{"seq":0}\n{"seq":1,"data":"long"}\n', 12)).toBe('')
  })
})
