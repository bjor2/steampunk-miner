import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../registries/registrar'
import { planetParamsFor } from '../../../systems/world/planetParams'
import { oreFaceOf } from './oreFace'

const PLANET_1 = planetParamsFor(1, 1)

describe('ore face', () => {
  it('names a kernel ore with its family and the grade its tier reaches', () => {
    // The kernel default's name and icon: with the ores slice (#146) the catalogue answers instead.
    const face = withRegistrations([], () => oreFaceOf('kernel.crystal.t2', PLANET_1))
    expect(face).toMatchObject({
      oreId: 'kernel.crystal.t2',
      name: 'Crystal ore, tier 2',
      family: 'crystal',
      gradeName: 'Raw',
      iconId: 'none',
    })
  })

  it('reads the grade from the tier on the #151 thresholds', () => {
    expect(oreFaceOf('kernel.metal.t30', PLANET_1)?.gradeName).toBe('Lumen')
  })

  it('draws the swatch in the colour the ground draws the ore in, apart per family', () => {
    const metal = oreFaceOf('kernel.metal.t2', PLANET_1)!.swatch
    const crystal = oreFaceOf('kernel.crystal.t2', PLANET_1)!.swatch
    expect(metal).toMatch(/^rgb\(\d+ \d+ \d+\)$/)
    expect(metal).not.toBe(crystal)
  })

  it('answers null for an id no ore has', () => {
    expect(oreFaceOf('kernel.lava.t2', PLANET_1)).toBeNull()
  })
})
