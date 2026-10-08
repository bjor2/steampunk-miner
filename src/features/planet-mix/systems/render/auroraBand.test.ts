import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../../../registries/registrar'
import { planetSkyBandOf } from '../../../../systems/registries/planetSkyBand'
import { planetParamsFor } from '../../../../systems/world/planetParams'
import { slice } from '../../register'
import { MAGNETIC_AURORA } from './auroraBand'

const SEED = 83921

function bandOn(planetIndex: number) {
  return withRegistrations([slice], () => planetSkyBandOf(planetParamsFor(SEED, planetIndex)))
}

describe('magnetic aurora', () => {
  it('lights a thin blue band above the surface on every magnetic planet, endless ones too', () => {
    for (const planet of [25, 29, 43, 48]) expect(bandOn(planet)).toEqual(MAGNETIC_AURORA)
  })

  it('draws it from the magnetic field asset’s ribbon', () => {
    expect(MAGNETIC_AURORA.ribbon).toEqual({
      assetId: 'prop-magnetic-field',
      partId: 'aurora-ribbon',
    })
  })

  it('lights no band off the magnetic class: P1, frozen P17 and the relic planet P30', () => {
    expect([1, 17, 30].map(bandOn)).toEqual([null, null, null])
  })
})
