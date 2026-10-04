import { describe, expect, it } from 'vitest'
import { createRunId, isValidRunId, runFilePaths } from './runLayout'

describe('run layout', () => {
  it('names a run after its start time, as the design doc folder example does', () => {
    expect(createRunId(new Date('2026-10-04T20:30:15Z'))).toBe('run_2026-10-04_20-30-15')
  })

  it('puts the four run files in one folder per run', () => {
    expect(runFilePaths('run_x')).toEqual({
      events: 'logs/run_x/events.ndjson',
      commands: 'logs/run_x/commands.ndjson',
      summary: 'logs/run_x/summary.json',
      metadata: 'logs/run_x/metadata.json',
    })
  })

  it('accepts the ids it makes', () => {
    expect(isValidRunId(createRunId(new Date('2026-10-04T20:30:15Z')))).toBe(true)
  })

  it('refuses ids that could leave the log folder', () => {
    expect(isValidRunId('../etc')).toBe(false)
    expect(isValidRunId('a/b')).toBe(false)
    expect(isValidRunId('')).toBe(false)
  })
})
