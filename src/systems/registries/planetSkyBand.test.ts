import { describe, expect, it } from 'vitest'
import { planetParamsFor } from '../world/planetParams'
import {
  MIN_SKY_BAND_THICKNESS_M,
  PLANET_SKY_BAND_REGISTRY,
  planetSkyBandOf,
  type PlanetSkyBandLook,
  type PlanetSkyBandProvider,
} from './planetSkyBand'
import { addToRegistry, RegistrationRefusedError, withFreshRegistrySet } from './seal'

const PARAMS = planetParamsFor(83921, 25)

const AURORA: PlanetSkyBandLook = {
  colour: '#5fb4ff',
  heightM: 3,
  thicknessM: 4,
  flicker: 0.4,
  ribbon: null,
}

function providerAnswering(
  look: PlanetSkyBandLook | null,
  id = 'fake-sky.band',
): PlanetSkyBandProvider {
  return { id, bandOf: () => look }
}

function bandWith(providers: readonly PlanetSkyBandProvider[]) {
  return withFreshRegistrySet(
    () =>
      providers.forEach((provider) =>
        addToRegistry(PLANET_SKY_BAND_REGISTRY, provider.id.split('.')[0], provider),
      ),
    () => planetSkyBandOf(PARAMS),
  )
}

describe('planet sky band', () => {
  it('draws no band with no provider', () => {
    expect(bandWith([])).toBeNull()
  })

  it('draws no band where the provider answers none', () => {
    expect(bandWith([providerAnswering(null)])).toBeNull()
  })

  it('draws the band the provider answers for the planet', () => {
    const seen: number[] = []
    const provider: PlanetSkyBandProvider = {
      id: 'fake-sky.band',
      bandOf: (params) => {
        seen.push(params.planetIndex)
        return AURORA
      },
    }
    expect(bandWith([provider])).toEqual(AURORA)
    expect(seen).toEqual([25])
  })

  it('holds the flicker to 0..1, the height above the surface and the band to a visible width', () => {
    const wild = { ...AURORA, heightM: -2, thicknessM: 0, flicker: 3 }
    expect(bandWith([providerAnswering(wild)])).toEqual({
      ...AURORA,
      heightM: 0,
      thicknessM: MIN_SKY_BAND_THICKNESS_M,
      flicker: 1,
    })
    expect(bandWith([providerAnswering({ ...AURORA, flicker: -1 })])?.flicker).toBe(0)
  })

  it('refuses a second provider', () => {
    expect(() =>
      bandWith([providerAnswering(AURORA, 'one.band'), providerAnswering(AURORA, 'two.band')]),
    ).toThrow(RegistrationRefusedError)
  })
})
