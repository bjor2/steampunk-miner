import { describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS } from '../constants/devFlags'
import { withDrillExactCarry, withReportCapsule } from '../systems/authority/cutCarryFixtures'
import { asCharged, committedGoldenRuns } from './chargedGoldenDigests'
import { goldenRunProblems } from './goldenRun'

// The `drill.reportCapsule` kill-switch (ticket 537, A7, the TD shape 6228947744 section 4 and
// its goldens gate, bounded to interval 1 by the GD 6241320435): the capsule is cut only for a
// report at interval 1 with `drill.exactCarry` on, so the flag-off game is protocol 86's byte for
// byte: every committed golden (default flags) replays to its digests and mined order with the
// switch on, as it ships, and off. The goldens' reports are 12-tick, so with the exact carry on
// they replay to A6's charged digests (`chargedGoldenDigests.ts`) with the switch on or off: a
// 12-tick report never carves a capsule.

const goldens = committedGoldenRuns().map((golden) => [golden.name, golden] as const)

describe('drill.reportCapsule kill-switch (ticket 537)', () => {
  it('ships with the report capsule on', () => {
    expect(AUTHORITY_DEV_FLAGS['drill.reportCapsule']).toBe(true)
  })

  it.each(goldens)(
    'replays %s byte for byte as it ships, and with the switch off',
    (_name, golden) => {
      expect(goldenRunProblems(golden)).toEqual([])
      expect(withReportCapsule(false, () => goldenRunProblems(golden))).toEqual([])
    },
  )

  it.each(goldens)(
    'replays %s with the exact carry on to A6’s digests, the switch on or off: 12-tick reports carve no capsule',
    (_name, golden) => {
      const charged = () => goldenRunProblems(asCharged(golden))
      expect(withDrillExactCarry(true, () => withReportCapsule(false, charged))).toEqual([])
      expect(withDrillExactCarry(true, () => withReportCapsule(true, charged))).toEqual([])
    },
  )
})
