import { describe, expect, it } from 'vitest'
import { dockGuaranteeCount } from '../systems/world/dockGuarantee'
import { planetParamsFor } from '../systems/world/planetParams'
import { createRunMetadata, type RunFacts } from './runMetadata'

const FACTS: RunFacts = {
  runId: 'run_test',
  gameVersion: '0.1.0',
  buildCommit: 'abc1234',
  worldSeed: 83921,
  platform: 'browser',
  debugEnabled: false,
  debugApplied: false,
  players: 1,
  startTime: '2026-10-05T10:00:00.000Z',
  endTime: null,
}

describe('run metadata', () => {
  it('records whether planet 1 of the seed got the dock-guaranteed ore patch (#42)', () => {
    const metadata = createRunMetadata(FACTS)
    expect([0, 1]).toContain(metadata.patchDockGuaranteed)
    expect(metadata.patchDockGuaranteed).toBe(dockGuaranteeCount(planetParamsFor(83921, 1)))
  })

  it('records generator version 2 (#36)', () => {
    expect(createRunMetadata(FACTS).generatorVersion).toBe(3)
  })
})
