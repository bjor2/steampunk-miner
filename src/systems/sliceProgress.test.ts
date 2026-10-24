import { describe, expect, it } from 'vitest'
import type { DomainEvent } from './authority/domainEvent'
import { travelTransitionOf } from './sliceProgress'

const stamp = { playerId: 'p1', tick: 10, seq: 3 }

describe('slice progress', () => {
  it('plays the travel transition when the events start a travel', () => {
    const events: DomainEvent[] = [
      {
        ...stamp,
        type: 'TravelStarted',
        fromPlanet: 1,
        toPlanet: 2,
        cost: '6.075e+1',
        coreSpent: 63,
      },
      { ...stamp, type: 'PlanetUnlocked', planetIndex: 2 },
    ]
    expect(travelTransitionOf(events)).toEqual({ fromPlanet: 1, toPlanet: 2, seconds: 10 })
  })

  it('plays a star-map jump for 2 s, so control returns within 2 s of confirming (ticket 755)', () => {
    const events: DomainEvent[] = [
      {
        ...stamp,
        type: 'TravelStarted',
        fromPlanet: 1,
        toPlanet: 3,
        cost: '0e+0',
        coreSpent: 0,
        fuelSpent: '2e+0',
      },
    ]
    expect(travelTransitionOf(events)).toEqual({ fromPlanet: 1, toPlanet: 3, seconds: 2 })
  })

  it('plays no transition for events without a travel', () => {
    expect(travelTransitionOf([{ ...stamp, type: 'CoreReached' }])).toBeNull()
  })
})
