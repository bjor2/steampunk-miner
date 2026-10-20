import { describe, expect, it } from 'vitest'
import { cappedRampsThrough, surfaceLayerCapLines } from './surfaceLayerReport'

// Ticket 625 Done-when (VS on #625, 6301930425): where the band-1 cap binds, log amber with the
// planet and the actual per-cell step, and a row naming the first planet where it binds.

describe('surface layer report', () => {
  it('names planet 43 as the first planet where the band-1 cap binds', () => {
    expect(surfaceLayerCapLines()[0]).toBe('the band-1 cap first binds on planet 43')
  })

  it('lists each capped planet amber with its ramp cells and actual per-cell step', () => {
    const lines = surfaceLayerCapLines()
    expect(lines[1]).toBe('planet 43 amber: ramp capped at 69 of 71 cells, 1.513x a cell')
    expect(lines).toHaveLength(1 + cappedRampsThrough(60).length)
  })

  it('says the cap binds nowhere when no planet in reach is capped', () => {
    expect(surfaceLayerCapLines(40)).toEqual([
      'the band-1 cap binds on no planet through planet 40',
    ])
  })
})
