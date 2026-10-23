import { describe, expect, it } from 'vitest'
import { fuelPriceOf } from '../systems/economy/jumpFuel'
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

function lineOn(planet: number, event: string, data: object): RunEvent {
  return {
    v: LOG_SCHEMA_VERSION,
    seq: seq++,
    timestamp: 0,
    runId: 'run_clamp',
    playerId: 'p1',
    planet,
    depthTiles: 0,
    tick: planet * 100,
    event,
    data,
  } as RunEvent
}

/** The hop's five units bought on `fromPlanet` for `cost`, then the jump that burns them. */
function jumpFrom(fromPlanet: number, cost: string): RunEvent[] {
  return [
    lineOn(fromPlanet, 'fuel_bought', { units: 5, cost, tank: '5e+0' }),
    lineOn(fromPlanet, 'travel_started', {
      fromPlanet,
      toPlanet: fromPlanet + 1,
      cost: '0e+0',
      coreSpent: 0,
      fuelSpent: '5e+0',
    }),
  ]
}

const fullJump = (fromPlanet: number) =>
  jumpFrom(fromPlanet, toCanonical(fuelPriceOf(fromPlanet, 5)))

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

  it("judges a star-map jump on the fuel bought for it, not on the jump's own zero cost (ticket 756)", () => {
    const events = [...fullJump(1), ...jumpFrom(2, '1e+1'), ...fullJump(3), ...fullJump(4)]
    expect(travelClampCountOf(events)).toEqual({
      hops: 4,
      clamped: 1,
      openingHops: 4,
      openingClamped: 1,
    })
  })

  it('counts a jump on fuel already in the tank as paid in full', () => {
    const [, jump] = jumpFrom(2, '0e+0')
    expect(travelClampCountOf([...fullJump(1), jump])).toMatchObject({ hops: 2, clamped: 0 })
  })
})
