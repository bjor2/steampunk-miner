import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import type { SaveSection } from '../systems/registries/saveSections'
import { GOLDEN_SCRIPTS } from '../systems/replay/goldenScripts'
import {
  currentGoldenVersions,
  formatGoldenRun,
  goldenRunProblems,
  recordGoldenRun,
  REGENERATE_HINT,
} from './goldenRun'

// The golden header records each registered save section's version (feature-slices.md 5.4), only
// while one is registered, so the committed files stay byte-identical without sections.

function sectionSliceOf(version: number): SliceDefinition {
  const section: SaveSection<number> = {
    id: 'golden-probe',
    version,
    scope: 'session',
    initial: 0,
    problems: () => [],
    toPortable: (value) => value,
    ofPortable: (body) => body as number,
  }
  return { id: 'golden-probe', register: (r) => r.saveSection(section) }
}

/** The first golden script's file header, as recorded with no section registered. */
const plainGolden = () => withRegistrations([], () => recordGoldenRun(GOLDEN_SCRIPTS[0]))

describe('golden slice sections', () => {
  it('writes no sliceSections while no section is registered', () => {
    expect(withRegistrations([], () => 'sliceSections' in currentGoldenVersions())).toBe(false)
    expect(formatGoldenRun(plainGolden())).not.toContain('sliceSections')
  })

  it("records each registered section's version by id", () => {
    const versions = withRegistrations([sectionSliceOf(2)], currentGoldenVersions)
    expect(versions.sliceSections).toEqual({ 'golden-probe': 2 })
  })

  it('asks to regenerate a file written before a section was registered', () => {
    const golden = plainGolden()
    expect(withRegistrations([sectionSliceOf(1)], () => goldenRunProblems(golden))).toEqual([
      expect.stringContaining(REGENERATE_HINT),
    ])
  })

  it('asks to regenerate a file whose section version the code has bumped or dropped', () => {
    const golden = { ...plainGolden(), sliceSections: { 'golden-probe': 1 } }
    const bumped = withRegistrations([sectionSliceOf(2)], () => goldenRunProblems(golden))
    const dropped = withRegistrations([], () => goldenRunProblems(golden))
    expect([...bumped, ...dropped]).toEqual([
      expect.stringContaining(REGENERATE_HINT),
      expect.stringContaining(REGENERATE_HINT),
    ])
  })
})
