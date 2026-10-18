import { describe, expect, it } from 'vitest'
import { withDrillExactCarry, withHeatWorkUncapped } from '../systems/authority/cutCarryFixtures'
import { asCharged, committedGoldenRuns } from './chargedGoldenDigests'
import { goldenRunProblems } from './goldenRun'

// The `heat.workUncapped` kill-switch (ticket 541, shape (b), the TD seam 6232743242): it ships
// off, so the committed goldens are protocol 87's digests under the new header, the proof that
// the uncapped heat changed nothing with the switch off. The goldens' reports drill no more ticks
// than elapsed since the gauge settled, as the bot's clock does, so with the switch on every
// golden replays to its committed digests, and with the exact carry on as well to A6's charged
// digests (`chargedGoldenDigests.ts`): the switch moves heat only where work outruns the wall.

describe('heat.workUncapped kill-switch (ticket 541)', () => {
  it.each(committedGoldenRuns().map((golden) => [golden.name, golden] as const))(
    'replays %s with the switch on to its committed digests',
    (_name, golden) => {
      expect(withHeatWorkUncapped(true, () => goldenRunProblems(golden))).toEqual([])
    },
  )

  it.each(committedGoldenRuns().map((golden) => [golden.name, golden] as const))(
    'replays %s with the switch and the exact carry on to the charged digests',
    (_name, golden) => {
      const charged = asCharged(golden)
      const problems = withDrillExactCarry(true, () =>
        withHeatWorkUncapped(true, () => goldenRunProblems(charged)),
      )
      expect(problems).toEqual([])
    },
  )
})
