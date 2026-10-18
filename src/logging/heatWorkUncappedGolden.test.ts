import { describe, expect, it } from 'vitest'
import { withDrillExactCarry, withHeatWorkUncapped } from '../systems/authority/cutCarryFixtures'
import { asUncharged, committedGoldenRuns } from './chargedGoldenDigests'
import { goldenRunProblems } from './goldenRun'

// The `heat.workUncapped` kill-switch (ticket 541, shape (b), the TD seam 6232743242): it ships
// on since Bjor's "turn everything on" (18 Oct 2026). The goldens' reports drill no more ticks
// than elapsed since the gauge settled, as the bot's clock does, so with the switch on or off
// every golden replays to its committed digests, the charged ones from the exact carry: the
// switch moves heat only where work outruns the wall. With the exact carry off as well, the two
// goldens the charge moves replay to protocol 87's digests (`chargedGoldenDigests.ts`).

const goldens = committedGoldenRuns().map((golden) => [golden.name, golden] as const)

describe('heat.workUncapped kill-switch (ticket 541)', () => {
  it.each(goldens)('replays %s with the switch on to its committed digests', (_name, golden) => {
    expect(withHeatWorkUncapped(true, () => goldenRunProblems(golden))).toEqual([])
  })

  it.each(goldens)('replays %s with the switch off to its committed digests', (_name, golden) => {
    expect(withHeatWorkUncapped(false, () => goldenRunProblems(golden))).toEqual([])
  })

  it.each(goldens)(
    'replays %s with the switch and the exact carry off to the uncharged digests',
    (_name, golden) => {
      const uncharged = asUncharged(golden)
      const problems = withDrillExactCarry(false, () =>
        withHeatWorkUncapped(false, () => goldenRunProblems(uncharged)),
      )
      expect(problems).toEqual([])
    },
  )
})
