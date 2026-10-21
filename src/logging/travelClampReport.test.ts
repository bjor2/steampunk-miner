import { describe, expect, it } from 'vitest'
import { travelFee } from '../systems/economy/planetCharges'
import { toCanonical } from '../systems/money'
import { LOG_SCHEMA_VERSION, type RunEvent } from './runEvent'
import { travelClampCountOf, travelClampLines } from './travelClampReport'

let seq = 0

function hopFrom(fromPlanet: number, cost: string): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: seq++,
    timestamp: 0,
    runId: 'run_clamp',
    playerId: 'p1',
    planet: fromPlanet,
    depthTiles: 0,
    tick: fromPlanet * 100,
    event: 'travel_started',
    data: { fromPlanet, toPlanet: fromPlanet + 1, cost, coreSpent: 0 },
  } as RunEvent
}

const fullHop = (fromPlanet: number) => hopFrom(fromPlanet, toCanonical(travelFee(fromPlanet)))

describe('travel clamp report', () => {
  it('counts a hop as clamped only when it cost less than the row fee of the planet left', () => {
    const events = [fullHop(1), hopFrom(2, '0e+0'), fullHop(3), fullHop(4), hopFrom(5, '1e+1')]
    expect(travelClampCountOf(events)).toEqual({
      hops: 5,
      clamped: 2,
      openingHops: 4,
      openingClamped: 1,
    })
  })

  it('flags a seed whose clamp binds on more than 1 of the 4 P1→P5 hops', () => {
    const lines = travelClampLines([
      { worldSeed: 7, events: [fullHop(1), hopFrom(2, '0e+0'), fullHop(3), fullHop(4)] },
      { worldSeed: 8, events: [hopFrom(1, '0e+0'), hopFrom(2, '0e+0'), fullHop(3)] },
    ])
    expect(lines).toEqual([
      'seed 7 · clamped on 1 of 4 P1→P5 hops, 1 of 4 hops in all',
      'seed 8 · clamped on 2 of 3 P1→P5 hops, 2 of 3 hops in all · fix the base fee formula',
    ])
  })
})
