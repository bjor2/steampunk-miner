import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '../authority/domainEvent'
import { hasPlanetChanged } from './planetChange'

const STAMP = { playerId: 'p1', tick: 900, seq: 4 }

const arrivalByTravel: DomainEvent[] = [
  { ...STAMP, type: 'PlanetUnlocked', planetIndex: 2 },
  { ...STAMP, type: 'PlanetEntered', planetSeed: 77, generatorVersion: 1, radius: 2400 },
]

describe('planet change screenshot', () => {
  it('is due for a batch that arrives on a planet by travel', () => {
    expect(hasPlanetChanged(arrivalByTravel)).toBe(true)
  })

  it('is due for a debug or scenario move to another planet', () => {
    expect(hasPlanetChanged([{ ...STAMP, type: 'PlanetChanged', planetIndex: 5 }])).toBe(true)
  })

  it('is not due for a batch that stays on the planet', () => {
    expect(hasPlanetChanged([{ ...STAMP, type: 'PlanetSeedChanged', planetSeed: 9 }])).toBe(false)
    expect(hasPlanetChanged([])).toBe(false)
  })
})
