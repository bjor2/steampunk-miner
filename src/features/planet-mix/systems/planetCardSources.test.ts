import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { planetCardOf } from '../../../systems/registries/planetCardLines'

const LINE = 'Magnetic. Ferrous veins throw fields; the probe reads them.'

function tagsOn(planetIndex: number): string[] {
  const state = createAuthorityState({ planetIndex, planetSeed: 1, playerIds: ['p1'] })
  return planetCardOf(state)?.lines.map((line) => line.tag) ?? []
}

describe('planet-mix planet card lines', () => {
  it('puts the "Magnetic" tag and its arrival line on a magnetic planet\'s card', () => {
    const state = createAuthorityState({ planetIndex: 25, planetSeed: 1, playerIds: ['p1'] })
    expect(planetCardOf(state)?.lines).toEqual([
      {
        sourceId: 'planet-mix.card-magnetic',
        tag: 'Magnetic',
        arrivalLine: LINE,
        gateKind: null,
        values: [],
      },
    ])
  })

  it('tags every magnetic planet, endless P43 and P48 included, and not P30 (relic)', () => {
    const tagged = [24, 25, 28, 29, 30, 43, 48].filter((p) => tagsOn(p).includes('Magnetic'))
    expect(tagged).toEqual([25, 28, 29, 43, 48])
  })

  it('shows no card on a planet whose class is not live or has none', () => {
    expect(tagsOn(1)).toEqual([])
    expect(tagsOn(17)).toEqual([])
    expect(tagsOn(30)).toEqual([])
  })
})
