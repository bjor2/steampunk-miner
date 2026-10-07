import { describe, expect, it } from 'vitest'
import {
  createRunId,
  heapSnapshotFile,
  isValidRunId,
  isValidSnapshotFile,
  runFilePaths,
  saveSnapshotFile,
  screenshotFile,
} from './runLayout'

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

  it('names each snapshot after its tick inside the run folder (#123)', () => {
    expect(saveSnapshotFile(18000)).toBe('snapshots/save-18000.json')
    expect(heapSnapshotFile(18000)).toBe('heap/18000.heapsnapshot')
    expect(screenshotFile(18000, 'planet_change')).toBe('shots/18000-planet_change.png')
  })

  it('accepts the snapshot names it makes', () => {
    const files = [saveSnapshotFile(0), heapSnapshotFile(7), screenshotFile(42, 'budget_breach')]
    expect(files.every(isValidSnapshotFile)).toBe(true)
  })

  it('refuses snapshot names that could leave the run folder or are not snapshots', () => {
    expect(isValidSnapshotFile('../events.ndjson')).toBe(false)
    expect(isValidSnapshotFile('snapshots/../../x.json')).toBe(false)
    expect(isValidSnapshotFile('events.ndjson')).toBe(false)
    expect(isValidSnapshotFile('shots/1-a.png/x')).toBe(false)
  })
})
