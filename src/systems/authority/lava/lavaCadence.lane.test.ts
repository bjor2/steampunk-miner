import { describe, expect, it } from 'vitest'
import { crossPocket } from './lavaFixtures'

// Burns per pocket crossed at 5, 44, 240 and 3600 m/s at a report every tick (#514 Done-when 7):
// logged, not gated (TD 6228838433 finding 2, Systems 6228846052). The grace is in absolute ticks,
// so a slow pass under the six-cell pocket stays in reach long enough to burn again (5 m/s: 5
// burns), and at 3600 m/s the poses sit 60 m apart and step over the pocket at any cadence (the
// uncut span between reports, the parked bore-bar wiring, TD v2 Q5 on #514), not the lava rule.
// Standing contact follows the 20-tick grace at every cadence (VS 6228847292 item 3), asserted in
// `lavaCadence.test.ts`. A lane: it runs only when named and prints its counts.

const CROSSING_SPEEDS_MPS = [5, 44, 240, 3600]

describe('lava burns per pocket crossed at a report every tick (#514 Done-when 7, lane)', () => {
  it('logs the burns for a pocket crossed at 5, 44, 240 and 3600 m/s', () => {
    const burns = CROSSING_SPEEDS_MPS.map((speedMps) => crossPocket(speedMps, 1).burnTicks.length)
    console.log(`burns crossing the pocket at ${CROSSING_SPEEDS_MPS.join(', ')} m/s: ${burns}`)
    expect(burns).toHaveLength(CROSSING_SPEEDS_MPS.length)
  })
})
