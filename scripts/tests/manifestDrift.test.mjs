// The box Tester's gate on tests/MANIFEST.md (#229): it reads the repo, never runs Vitest, so it
// stays fast in every scoped run (scripts/ci/selectPushTests.sh adds it for any test file change).
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PACING_WORLD_SEEDS } from '../../src/constants/pacingSeeds.ts'
import { contentScheduleRowClaims } from '../../src/systems/registries/content.ts'
import { dockFacilityScheduleRowClaims } from '../../src/systems/registries/dockFacilities.ts'
import { CROSS_SLICE_CHECKS, GATE_SEEDS } from './crossSliceChecks.mjs'
import {
  crossSliceCheckProblems,
  manifestDriftProblems,
  scheduledSlicesWithoutTests,
} from './manifestChecks.mjs'
import { readDiskTestFiles, readManifestFilesAt } from './testFiles.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))

describe('test manifest on main', () => {
  it('lists every test file on disk with its current test sites', () => {
    expect(manifestDriftProblems(readDiskTestFiles(ROOT), readManifestFilesAt(ROOT))).toEqual([])
  })

  it('has a test for every slice that ships a scheduled stats.json row', () => {
    const claims = [...contentScheduleRowClaims(), ...dockFacilityScheduleRowClaims()]
    expect(scheduledSlicesWithoutTests(claims, readManifestFilesAt(ROOT))).toEqual([])
  })

  it('points every cross-slice check at test files on disk', () => {
    const diskPaths = new Set(readDiskTestFiles(ROOT).map(({ path }) => path))
    expect(crossSliceCheckProblems(CROSS_SLICE_CHECKS, diskPaths)).toEqual([])
  })

  it('names the pacing gate seeds of both gated scenarios', () => {
    expect(GATE_SEEDS).toEqual(PACING_WORLD_SEEDS['bot-slice'])
    expect(GATE_SEEDS).toEqual(PACING_WORLD_SEEDS['bot-slice-assay'])
  })
})
