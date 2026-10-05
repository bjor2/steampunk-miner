import { describe, expect, it } from 'vitest'
import { readUnlockSchedule } from './readUnlockSchedule'

const PIN = 'sha256:pinned'

function scheduleFile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schedule_locked: true,
    source_hash: PIN,
    features: [
      {
        id: 'assay_beacon',
        name: 'Assay beacon',
        planetIndex: 4,
        lane: 'Feature',
        progressionAxis: 'horizontal',
        status: 'vision',
        bind: 'planet_gate',
      },
    ],
    ...overrides,
  }
}

function featureWith(fields: Record<string, unknown>): Record<string, unknown> {
  const [row] = scheduleFile().features as Record<string, unknown>[]
  return { ...row, ...fields }
}

function problemsOf(raw: unknown): string[] {
  return readUnlockSchedule(raw, PIN).problems
}

describe('unlock schedule reading', () => {
  it('reads a #79 row and defaults its count to one', () => {
    const reading = readUnlockSchedule(scheduleFile(), PIN)
    expect('schedule' in reading && reading.schedule.rows).toEqual([
      expect.objectContaining({
        id: 'assay_beacon',
        planetIndex: 4,
        bind: 'planet_gate',
        count: 1,
      }),
    ])
  })

  it('accepts an endless row at planet 41 with no other change', () => {
    const features = [featureWith({ id: 'endless_row', planetIndex: 41 })]
    expect(problemsOf(scheduleFile({ features }))).toEqual([])
  })

  it('refuses a file whose source hash is not the pinned lock', () => {
    expect(problemsOf(scheduleFile({ source_hash: 'sha256:drifted' }))).toEqual([
      'source_hash must be the pinned lock sha256:pinned, got "sha256:drifted"',
    ])
  })

  it('refuses a schedule that is not locked', () => {
    expect(problemsOf(scheduleFile({ schedule_locked: false }))).toEqual([
      'schedule_locked must be true',
    ])
  })

  it('refuses an unknown lane, axis, status or bind', () => {
    const features = [
      featureWith({ lane: 'Quest', progressionAxis: 'diagonal', status: 'dreamt', bind: 'luck' }),
    ]
    expect(problemsOf(scheduleFile({ features }))).toHaveLength(4)
  })

  it('refuses a row missing its bind', () => {
    const features = [featureWith({ bind: undefined })]
    expect(problemsOf(scheduleFile({ features }))).toEqual([
      'features[0].bind must be one of planet_gate, artefact, facility, manual, got undefined',
    ])
  })

  it('refuses a planet index below one and a non-integer count', () => {
    const features = [featureWith({ planetIndex: 0, count: 1.5 })]
    expect(problemsOf(scheduleFile({ features }))).toEqual([
      'features[0].planetIndex must be at least 1',
      'features[0].count must be a safe integer',
    ])
  })

  it('refuses an id that is not snake_case', () => {
    const features = [featureWith({ id: 'Assay Beacon' })]
    expect(problemsOf(scheduleFile({ features }))).toEqual([
      'features[0].id must be snake_case, got "Assay Beacon"',
    ])
  })

  it('refuses the same id twice', () => {
    const features = [featureWith({}), featureWith({})]
    expect(problemsOf(scheduleFile({ features }))).toEqual([
      'features id "assay_beacon" appears twice',
    ])
  })

  it('lists every problem at once instead of stopping at the first', () => {
    const features = [featureWith({ lane: 'Quest' })]
    const raw = scheduleFile({ schedule_locked: false, source_hash: 'x', features })
    expect(problemsOf(raw)).toHaveLength(3)
  })
})
