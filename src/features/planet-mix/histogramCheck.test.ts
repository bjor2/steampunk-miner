import { describe, expect, it } from 'vitest'
import { planetParamsFor } from '../../systems/world/planetParams'
import { histogramLines, histogramProblems } from './histogramCheck'
import { expectedSharesOf, type BandHistogram, type PlanetHistogram } from './mixHistogram'

const WORLD_SEED = 83921
/** A Frost planet: no lava, no story, so every expected share is one number. */
const PLANET = 20
const BAND_TILES = 100000

/** A histogram whose every band holds each role at `shareOf(role, lowBp)` of its tiles. */
function histogramWith(
  patches: number,
  shareOf: (role: string, band: number, lowBp: number) => number = (_, __, lowBp) => lowBp,
): PlanetHistogram {
  const expected = expectedSharesOf(planetParamsFor(WORLD_SEED, PLANET))
  const bands: BandHistogram[] = expected.map((shares, at) => {
    const types = [...shares].map(([role, { lowBp }]) => ({
      typeId: `type_${role}`,
      role,
      tiles: (shareOf(role, at + 1, lowBp) * BAND_TILES) / 10000,
    }))
    const oreTiles = types.reduce((sum, type) => sum + type.tiles, 0)
    return { band: at + 1, oreTiles, patches, types }
  })
  return { planetIndex: PLANET, worldSeed: WORLD_SEED, bands }
}

describe('ore mix histogram check', () => {
  it('finds nothing wrong with shares that match the mix', () => {
    expect(histogramProblems([histogramWith(5000), histogramWith(5000)])).toEqual([])
  })

  it('names a band whose signature share misses the mix', () => {
    const noSignature = histogramWith(5000, (role, _, lowBp) => (role === 'signature' ? 0 : lowBp))
    const problems = histogramProblems([noSignature])
    expect(problems).toContain('P20 band 4: signature 0 bp, expected 300 bp')
    expect(problems).toContain('P20 band 5: signature 0 bp, expected 300 bp')
    expect(problems.filter((line) => line.startsWith('P20 band 3'))).toEqual([])
  })

  it('allows a small band the spread of its few patch rolls, and a big band only the tolerance', () => {
    const shifted = (role: string, band: number, lowBp: number) =>
      band === 5 && role === '+2' ? lowBp + 200 : lowBp
    const problemsOf = (patches: number) =>
      histogramProblems([histogramWith(patches, shifted)]).filter((line) => line.includes('+2'))
    expect(problemsOf(40)).toEqual([])
    // 200 bp more of +2 over 102% of the tiles: 3500 / 102000.
    expect(problemsOf(5000)).toEqual(['P20 band 5: +2 343 bp, expected 150 bp'])
  })

  it('names a role the mix does not have', () => {
    const histogram = histogramWith(5000)
    const band = histogram.bands[0]
    const offMix = { typeId: 'exotic_t34', role: '+2', tiles: 10 }
    const bands = [{ ...band, types: [...band.types, offMix] }, ...histogram.bands.slice(1)]
    expect(histogramProblems([{ ...histogram, bands }])).toContain(
      'P20 band 1: +2 is not in the mix (1 bp)',
    )
  })

  it('prints one line per band with each type, its role, share and the expected share', () => {
    const [bandFive] = histogramLines(histogramWith(40)).slice(4)
    expect(bandFive).toMatch(/^P20 seed 83921 b5 100000 tiles in 40 patches: /)
    expect(bandFive).toContain('type_signature [signature] 300 bp (300 bp);')
  })
})
