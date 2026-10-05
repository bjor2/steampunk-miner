import { describe, expect, it } from 'vitest'
import type { DomainEvent } from './authority/domainEvent'
import { isSliceEndReached, travelTransitionOf } from './sliceProgress'

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
    expect(travelTransitionOf(events)).toEqual({ fromPlanet: 1, toPlanet: 2 })
  })

  it('plays no transition for events without a travel', () => {
    expect(travelTransitionOf([{ ...stamp, type: 'CoreReached' }])).toBeNull()
  })

  it('reaches the end of the slice only with the core of planet 2 completed', () => {
    expect(isSliceEndReached(1, true)).toBe(false)
    expect(isSliceEndReached(2, false)).toBe(false)
    expect(isSliceEndReached(2, true)).toBe(true)
  })
})
