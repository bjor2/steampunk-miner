import { describe, expect, it } from 'vitest'
import {
  PLANET_ROW_REGISTRY,
  planetDisplayNameOf,
  planetLookOf,
  planetRowOf,
  rowRadiusTilesOf,
  type FrozenRadius,
  type PlanetRowProvider,
} from './planetRow'
import { addToRegistry, RegistrationRefusedError, withFreshRegistrySet } from './seal'

// The planet-row registry (GD lock on #707, 6326252575): one provider at most, laid over the
// kernel's generated row, so a field it leaves out, and every field with no provider, keeps the
// generated one.

const FROZEN_421: FrozenRadius = { tiles: 421, fromOreRules: 7, reason: 'frozen R(2)' }

function providerOf(rowOf: PlanetRowProvider['rowOf'], id = 'fake-rows.rows'): PlanetRowProvider {
  return { id, rowOf }
}

function readWith<T>(providers: readonly PlanetRowProvider[], read: () => T): T {
  return withFreshRegistrySet(
    () =>
      providers.forEach((provider) =>
        addToRegistry(PLANET_ROW_REGISTRY, provider.id.split('.')[0], provider),
      ),
    read,
  )
}

describe('planet row', () => {
  it('names a planet by its number, with no pool, look or frozen radius, with no provider', () => {
    expect(readWith([], () => planetRowOf(3))).toEqual({
      planetIndex: 3,
      displayName: 'Planet 3',
      solarSystem: 1,
      poolId: null,
      look: null,
      radius: null,
    })
    expect(readWith([], () => planetDisplayNameOf(3))).toBe('Planet 3')
    expect(readWith([], () => planetLookOf(3))).toBeNull()
    expect(readWith([], () => rowRadiusTilesOf(3, 9))).toBeNull()
  })

  it("lays the provider's fields over the generated row and keeps the ones it leaves out", () => {
    const provider = providerOf((planet) =>
      planet === 2 ? { displayName: 'Gravelholm', poolId: 'foothold-p2', radius: FROZEN_421 } : {},
    )
    expect(readWith([provider], () => planetRowOf(2))).toEqual({
      planetIndex: 2,
      displayName: 'Gravelholm',
      solarSystem: 1,
      poolId: 'foothold-p2',
      look: null,
      radius: FROZEN_421,
    })
    expect(readWith([provider], () => planetDisplayNameOf(12))).toBe('Planet 12')
  })

  it('resolves any planet from 1 with no table bound', () => {
    for (const planet of [1, 41, 1000, 1_000_000, Number.MAX_SAFE_INTEGER]) {
      expect(readWith([], () => planetRowOf(planet).displayName)).toBe(`Planet ${planet}`)
    }
  })

  it('sizes a planet by its frozen radius only under the ore rules the override keys on', () => {
    const provider = providerOf(() => ({ radius: FROZEN_421 }))
    expect(readWith([provider], () => rowRadiusTilesOf(2, 7))).toBe(421)
    expect(readWith([provider], () => rowRadiusTilesOf(2, 9))).toBe(421)
    expect(readWith([provider], () => rowRadiusTilesOf(2, 6))).toBeNull()
    expect(readWith([provider], () => rowRadiusTilesOf(2, undefined))).toBeNull()
  })

  it('refuses a second provider', () => {
    const first = providerOf(() => ({ displayName: 'A' }))
    const second = providerOf(() => ({ displayName: 'B' }), 'other-rows.rows')
    expect(() => readWith([first, second], () => planetRowOf(1))).toThrow(RegistrationRefusedError)
  })
})
