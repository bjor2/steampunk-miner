import { describe, expect, it } from 'vitest'
import { AUTHORITY_DEV_FLAGS } from '../constants/devFlags'
import { withDrillExactCarry } from '../systems/authority/cutCarryFixtures'
import { asCharged, CHARGED_DIGESTS, committedGoldenRuns } from './chargedGoldenDigests'
import { goldenRunProblems } from './goldenRun'

// The `drill.exactCarry` kill-switch (ticket 535, A6, the TD shape 6228682000 item 4 and the
// goldens gate). It ships off until #541's heat change has landed (the GD 6234312287 condition 1),
// so the committed goldens are protocol 84's digests and mined order under the current header,
// the cheapest proof that the charge on density removed changed nothing with the switch off. With
// the switch on, only the two goldens whose pose reports drill move their end digest, to the
// digests pinned in `chargedGoldenDigests.ts` (the goldens' reports are 12-tick, so ticket 537's
// report capsule, cut at interval 1 only, leaves them as A6 recorded them); every other golden
// replays to its committed digests and mined order byte for byte.

describe('drill.exactCarry kill-switch (ticket 535)', () => {
  it('ships with the charge on density removed off until #541 lands', () => {
    expect(AUTHORITY_DEV_FLAGS['drill.exactCarry']).toBe(false)
  })

  it('pins a charged digest only where the charge moves it', () => {
    const committed = committedGoldenRuns()
    for (const [name, moved] of Object.entries(CHARGED_DIGESTS)) {
      const records = committed.find((golden) => golden.name === name)?.digests ?? []
      for (const [tick, digest] of Object.entries(moved)) {
        const record = records.find((candidate) => candidate.tick === Number(tick))
        expect(record?.digest).toMatch(/^[0-9a-f]{16}$/)
        expect(record?.digest).not.toBe(digest)
      }
    }
  })

  it.each(committedGoldenRuns().map((golden) => [golden.name, golden] as const))(
    'replays %s with the switch on to its committed digests, except the two the charge moves',
    (_name, golden) => {
      expect(withDrillExactCarry(true, () => goldenRunProblems(asCharged(golden)))).toEqual([])
    },
  )
})
