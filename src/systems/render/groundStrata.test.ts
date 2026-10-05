import { describe, expect, it } from 'vitest'
import { planetParamsFor } from '../world/planetParams'
import { bandColourOf, paletteOf } from './bandPalette'
import { STRATA_TILE_M, strataTintsOf, strataTurnsOf } from './groundStrata'

const planet1 = planetParamsFor(83921, 1)
const planet2 = planetParamsFor(83921, 2)

describe('ground strata', () => {
  it('lays one strata tile over 4 m of ground, the 1024 px tile at 256 px/m', () => {
    expect(STRATA_TILE_M).toBe(4)
  })

  it('closes every band on itself with a whole number of tiles, fewer the deeper it lies', () => {
    for (const params of [planet1, planet2]) {
      const turns = strataTurnsOf(params)
      expect(turns).toHaveLength(5)
      expect(turns.every(Number.isInteger)).toBe(true)
      expect([...turns].sort((a, b) => b - a)).toEqual(turns)
    }
  })

  it('leaves planet 1 untinted, since the maps are authored in its colours', () => {
    for (const tint of strataTintsOf(planet1.paletteId)) {
      for (const channel of tint) expect(channel).toBeCloseTo(1, 10)
    }
  })

  it('tints planet 2 so a band’s authored colour becomes planet 2’s band colour', () => {
    const tints = strataTintsOf(planet2.paletteId)
    for (const band of [1, 3, 5]) {
      const authored = bandColourOf(paletteOf(planet1.paletteId), band)
      const wanted = bandColourOf(paletteOf(planet2.paletteId), band)
      const tinted = authored.map((channel, at) => channel * tints[band - 1][at])
      tinted.forEach((channel, at) => expect(channel).toBeCloseTo(wanted[at], 10))
    }
  })
})
