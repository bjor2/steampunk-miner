import { describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS } from '../constants/devFlags'
import { withDrillExactCarry, withHeatWorkUncapped } from '../systems/authority/cutCarryFixtures'
import { asUncharged, committedGoldenRuns, UNCHARGED_DIGESTS } from './chargedGoldenDigests'
import { goldenRunProblems } from './goldenRun'

// The `drill.exactCarry` kill-switch (ticket 535, A6, the TD shape 6228682000 item 4 and the
// goldens gate). It ships on since Bjor's "turn everything on" (18 Oct 2026), so the committed
// goldens carry the charge: only the two goldens whose pose reports drill moved their end digest
// (the goldens' reports are 12-tick, so ticket 537's report capsule, cut at interval 1 only,
// leaves them as A6 recorded them). With the switch off those two replay to protocol 84's digests
// pinned in `chargedGoldenDigests.ts`, the proof that the kill-switch still turns the charge off;
// every other golden replays to its committed digests and mined order byte for byte either way.

describe('drill.exactCarry kill-switch (ticket 535)', () => {
  it('ships with the charge on density removed on', () => {
    expect(AUTHORITY_DEV_FLAGS['drill.exactCarry']).toBe(true)
  })

  it('pins an uncharged digest only where the charge moves it', () => {
    const committed = committedGoldenRuns()
    for (const [name, moved] of Object.entries(UNCHARGED_DIGESTS)) {
      const records = committed.find((golden) => golden.name === name)?.digests ?? []
      for (const [tick, digest] of Object.entries(moved)) {
        const record = records.find((candidate) => candidate.tick === Number(tick))
        expect(record?.digest).toMatch(/^[0-9a-f]{16}$/)
        expect(record?.digest).not.toBe(digest)
      }
    }
  })

  it.each(committedGoldenRuns().map((golden) => [golden.name, golden] as const))(
    'replays %s as it ships to its committed digests',
    (_name, golden) => {
      expect(goldenRunProblems(golden)).toEqual([])
    },
  )

  it.each(committedGoldenRuns().map((golden) => [golden.name, golden] as const))(
    'replays %s with the switch off to protocol 84’s digests, except the two the charge moves',
    (_name, golden) => {
      const uncharged = withHeatWorkUncapped(false, () =>
        withDrillExactCarry(false, () => goldenRunProblems(asUncharged(golden))),
      )
      expect(uncharged).toEqual([])
    },
  )
})
