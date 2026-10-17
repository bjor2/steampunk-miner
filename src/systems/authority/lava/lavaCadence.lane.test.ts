import { describe, expect, it } from 'vitest'
import { AGAINST_LAVA, carveHole, crossPocket, drillAgainst, onHeatPlanet } from './lavaFixtures'

// The two lava bars of #514 Done-when 7 that the cadence moves (the VS's amendments in the TD's
// addendum 6224615876, as Gameplay asked them): standing-contact burns the same at a report every
// tick as every 12 ticks, and the same burns per pocket crossed at 5, 44, 240 and 3600 m/s. Both
// read red at interval 1, for reasons in the rules the ticket keeps, not in the cadence code:
// - standing: the hit grace is 20 ticks, so a report every tick burns every 20 ticks (3 a second,
//   the grace's own rate), while 12-tick reports land a burn every 24 (2.5 a second);
// - crossing: the grace is in absolute ticks, so a slow pass under a six-cell pocket stays in
//   reach long enough to burn again (5 m/s: 5 burns), and at 3600 m/s poses sit 60 m apart and
//   step over the pocket at any cadence (the uncut span between reports, TD v2 Q5 on #514).
// Raised on #514 for the VS and Gameplay; nothing here is retuned. A lane: it runs only when
// named and prints its counts.

const STANDING_TICKS = 240
const CROSSING_SPEEDS_MPS = [5, 44, 240, 3600]

function standingBurnsAt(interval: number): number {
  const session = onHeatPlanet()
  session.submit(0, carveHole)
  return drillAgainst(session, AGAINST_LAVA, interval, STANDING_TICKS).length
}

describe('lava burns that the report cadence moves (#514 Done-when 7, lane)', () => {
  it('burns a drill held against lava as often at a report every tick as every 12 ticks', () => {
    const burns = { everyTick: standingBurnsAt(1), every12: standingBurnsAt(12) }
    console.log(`standing burns over ${STANDING_TICKS} ticks: ${JSON.stringify(burns)}`)
    expect(burns.everyTick).toBe(burns.every12)
  })

  it('burns the same for a pocket crossed at 5, 44, 240 and 3600 m/s at a report every tick', () => {
    const burns = CROSSING_SPEEDS_MPS.map((speedMps) => crossPocket(speedMps, 1).burnTicks.length)
    console.log(`burns crossing the pocket at ${CROSSING_SPEEDS_MPS.join(', ')} m/s: ${burns}`)
    expect(new Set(burns).size).toBe(1)
  })
})
