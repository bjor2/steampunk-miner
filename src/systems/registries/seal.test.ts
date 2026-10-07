import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addToRegistry,
  createRegistrySet,
  defineOneProviderRegistry,
  defineRegistry,
  entriesOf,
  FeaturesNotLoadedError,
  RegistrationRefusedError,
  registrationsOf,
  sealRegistrySet,
  swapRegistrySet,
  withFreshRegistrySet,
  type RegistrySet,
} from './seal'

interface Probe {
  id: string
  weight: number
}

const probes = defineRegistry<Probe>('probes')
const providers = defineOneProviderRegistry<Probe>('providers')

let loaded: RegistrySet

beforeEach(() => {
  loaded = swapRegistrySet(createRegistrySet())
})

afterEach(() => {
  swapRegistrySet(loaded)
})

describe('registry seal', () => {
  it('throws FeaturesNotLoadedError when a registry is read before the seal', () => {
    expect(() => entriesOf(probes)).toThrow(FeaturesNotLoadedError)
  })

  it('reads an empty registry as no entries once sealed', () => {
    sealRegistrySet()
    expect(entriesOf(probes)).toEqual([])
  })

  it('reads entries sorted by id whatever order they were registered in', () => {
    addToRegistry(probes, 'zeta', { id: 'zeta.b', weight: 1 })
    addToRegistry(probes, 'alpha', { id: 'alpha.c', weight: 2 })
    addToRegistry(probes, 'zeta', { id: 'zeta.a', weight: 3 })
    sealRegistrySet()
    expect(entriesOf(probes).map((probe) => probe.id)).toEqual(['alpha.c', 'zeta.a', 'zeta.b'])
  })

  it('reads registrations with the slice that made each, sorted by entry id', () => {
    addToRegistry(probes, 'zeta', { id: 'zeta.b', weight: 1 })
    addToRegistry(probes, 'alpha', { id: 'alpha.c', weight: 2 })
    sealRegistrySet()
    expect(registrationsOf(probes).map(({ sliceId, entry }) => [sliceId, entry.id])).toEqual([
      ['alpha', 'alpha.c'],
      ['zeta', 'zeta.b'],
    ])
  })

  it('throws FeaturesNotLoadedError when registrations are read before the seal', () => {
    expect(() => registrationsOf(probes)).toThrow(FeaturesNotLoadedError)
  })

  it('refuses a registration after the seal', () => {
    sealRegistrySet()
    expect(() => addToRegistry(probes, 'alpha', { id: 'alpha.late', weight: 1 })).toThrow(
      RegistrationRefusedError,
    )
  })

  it('refuses a duplicate id and names both slices', () => {
    addToRegistry(probes, 'alpha', { id: 'alpha.same', weight: 1 })
    expect(() => addToRegistry(probes, 'beta', { id: 'alpha.same', weight: 2 })).toThrow(
      /slice "alpha" and by slice "beta"/,
    )
  })

  it('refuses a second provider of a one-provider registry at the seal, naming both slices', () => {
    addToRegistry(providers, 'alpha', { id: 'alpha.provider', weight: 1 })
    addToRegistry(providers, 'beta', { id: 'beta.provider', weight: 2 })
    expect(() => sealRegistrySet()).toThrow(/slices "alpha" and "beta"/)
  })

  it('keeps registries apart, so one id may appear in two registries', () => {
    addToRegistry(probes, 'alpha', { id: 'alpha.shared', weight: 1 })
    addToRegistry(providers, 'alpha', { id: 'alpha.shared', weight: 2 })
    sealRegistrySet()
    expect(entriesOf(providers)).toEqual([{ id: 'alpha.shared', weight: 2 }])
  })

  it('puts the replaced set back with every registration it held', () => {
    addToRegistry(probes, 'alpha', { id: 'alpha.kept', weight: 1 })
    sealRegistrySet()
    const kept = swapRegistrySet(createRegistrySet())
    expect(() => entriesOf(probes)).toThrow(FeaturesNotLoadedError)
    swapRegistrySet(kept)
    expect(entriesOf(probes).map((probe) => probe.id)).toEqual(['alpha.kept'])
  })
})

describe('fresh registry set', () => {
  it('runs on its own sealed registrations and restores the set it replaced', () => {
    addToRegistry(probes, 'alpha', { id: 'alpha.kept', weight: 1 })
    sealRegistrySet()
    const inside = withFreshRegistrySet(
      () => addToRegistry(probes, 'beta', { id: 'beta.fake', weight: 2 }),
      () => entriesOf(probes).map((probe) => probe.id),
    )
    expect(inside).toEqual(['beta.fake'])
    expect(entriesOf(probes).map((probe) => probe.id)).toEqual(['alpha.kept'])
  })

  it('restores the replaced set when the run throws', () => {
    sealRegistrySet()
    expect(() =>
      withFreshRegistrySet(
        () => undefined,
        () => {
          throw new Error('boom')
        },
      ),
    ).toThrow('boom')
    expect(entriesOf(probes)).toEqual([])
  })
})
