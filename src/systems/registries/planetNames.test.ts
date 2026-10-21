import { describe, expect, it } from 'vitest'
import { PLANET_NAME_REGISTRY, planetDisplayNameOf, type PlanetNameProvider } from './planetNames'
import { addToRegistry, RegistrationRefusedError, withFreshRegistrySet } from './seal'

function providerNaming(nameOf: (planet: number) => string, id = 'fake-names.names') {
  return { id, nameOf } satisfies PlanetNameProvider
}

function namesWith(providers: readonly PlanetNameProvider[], planet: number): string {
  return withFreshRegistrySet(
    () =>
      providers.forEach((provider) =>
        addToRegistry(PLANET_NAME_REGISTRY, provider.id.split('.')[0], provider),
      ),
    () => planetDisplayNameOf(planet),
  )
}

describe('planet display names', () => {
  it('names a planet by its number with no provider', () => {
    expect(namesWith([], 3)).toBe('Planet 3')
  })

  it("answers the provider's name for the planet", () => {
    expect(namesWith([providerNaming((planet) => `Moor ${planet}`)], 12)).toBe('Moor 12')
  })

  it('refuses a second provider', () => {
    const first = providerNaming(() => 'A')
    const second = providerNaming(() => 'B', 'other-names.names')
    expect(() => namesWith([first, second], 1)).toThrow(RegistrationRefusedError)
  })
})
