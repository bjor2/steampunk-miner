import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../systems/authority/domainEvent'
import { domainEventsOnPlanet, trackPlanetStarts } from './planetDomainEvents'

function landed(tick: number): DomainEvent {
  return { tick, type: 'CoreReached' }
}

describe('domain events by planet (ticket 420)', () => {
  it('gives each planet the batches logged on it, a planet visited twice in both stretches', () => {
    const planets = trackPlanetStarts()
    const batches: [number, DomainEvent[]][] = [
      [1, [landed(1), landed(2)]],
      [1, []],
      [2, [landed(3)]],
      [1, [landed(4)]],
      [3, []],
    ]
    for (const [planet, events] of batches) planets.noteBatch(planet, events)
    const run = {
      events: batches.flatMap(([, events]) => events),
      planetStarts: planets.planetStarts(),
    }
    expect(domainEventsOnPlanet(run, 1).map(({ tick }) => tick)).toEqual([1, 2, 4])
    expect(domainEventsOnPlanet(run, 2).map(({ tick }) => tick)).toEqual([3])
    expect(domainEventsOnPlanet(run, 3)).toEqual([])
  })
})
