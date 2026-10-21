import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { planetCardOf } from '../../../systems/registries/planetCardLines'
import { CARD_LINE_CHARACTERS } from './planetHazards'

function linesOn(planetIndex: number) {
  const state = createAuthorityState({ planetIndex, planetSeed: 1, playerIds: ['p1'] })
  return planetCardOf(state)?.lines ?? []
}

function hazardTagsOn(planetIndex: number): string[] {
  return linesOn(planetIndex)
    .filter((line) => line.sourceId === 'ores.hazard-card')
    .map((line) => line.tag)
}

describe('ores hazard planet card', () => {
  it('reads each of planets 2 to 5 its own hazard line on arrival', () => {
    expect([2, 3, 4, 5].map((p) => linesOn(p).map((line) => line.arrivalLine))).toEqual([
      ['Rockfall. Loose scree pours into the cut; mind what hangs above.'],
      ['Firedamp. Sealed gas chokes the boiler when breached; back out.'],
      ['Spinecrystal. Brittle clusters shatter and score the hull.'],
      ['Steam vents. A cut vent blasts up the shaft; stand clear of it.'],
    ])
  })

  it('tags the line with the hazard and names no gate kind or value', () => {
    expect(linesOn(2)).toEqual([
      {
        sourceId: 'ores.hazard-card',
        tag: 'Rockfall',
        arrivalLine: 'Rockfall. Loose scree pours into the cut; mind what hangs above.',
        gateKind: null,
        values: [],
      },
    ])
  })

  it('keeps every line within two lines of the 360 px card', () => {
    const lengths = [2, 3, 4, 5].flatMap((p) => linesOn(p).map((line) => line.arrivalLine.length))
    expect(lengths.every((length) => length <= CARD_LINE_CHARACTERS)).toBe(true)
  })

  it('shows no hazard line on planet 1 or past planet 5', () => {
    expect([1, 6, 11, 25, 43].flatMap(hazardTagsOn)).toEqual([])
  })

  it('leaves the magnetic class card the only line on a magnetic planet', () => {
    expect(linesOn(25).map((line) => line.sourceId)).toEqual(['planet-mix.card-magnetic'])
  })
})
