import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../registries/registrar'
import type { SliceDefinition } from '../registries/sliceDefinition'
import { rampsPastBandOneThrough, surfaceLayerBandOneLines } from './surfaceLayerReport'

/** A registry whose planet 10 is 100 tiles: band 1 is 8 whole cells, the 19-cell layer runs past it. */
const TINY_PLANET_10: SliceDefinition = {
  id: 'fake',
  register: (r) =>
    r.planetRadius({ id: 'fake.radius', radiusTilesOf: (planet) => (planet === 10 ? 100 : null) }),
}

// Ticket 625 Done-when (VS on #625, 6301930425) with GD lock R2 on #302 (6306854642, ticket 643):
// the ramp stays in whole cells; where it reaches past band 1, log amber with the planet (cut to
// fit on #6's ladder, never shortened at a registry row's solved radius), and a row names the first
// planet where that happens.

describe('surface layer report', () => {
  it('names planet 43 as the first planet where the ramp reaches past band 1', () => {
    expect(surfaceLayerBandOneLines()[0]).toBe('the ramp first reaches past band 1 on planet 43')
  })

  it('lists each such planet amber; on the ladder its ramp is cut to fit, its step above 1.5x', () => {
    const lines = surfaceLayerBandOneLines()
    expect(lines[1]).toBe('planet 43 amber: ramp capped at 69 of 71 cells, 1.513x a cell')
    expect(lines).toHaveLength(1 + rampsPastBandOneThrough(60).length)
  })

  it('says the ramp stays inside band 1 when no planet in reach runs past it', () => {
    expect(surfaceLayerBandOneLines(40)).toEqual([
      'the ramp stays inside band 1 on every planet to 40',
    ])
  })

  it('lists a registry planet past band 1 amber with its uncut layer and the cells past band 1', () => {
    const lines = withRegistrations([TINY_PLANET_10], () => surfaceLayerBandOneLines(10))
    expect(lines).toEqual([
      'the ramp first reaches past band 1 on planet 10',
      'planet 10 amber: layer 19 cells, 11 past band 1, 1.466x a cell',
    ])
  })
})
