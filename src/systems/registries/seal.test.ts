import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addToRegistry,
  createRegistrySet,
  defineOneProviderRegistry,
  defineRegistry,
  entriesOf,
  FeaturesNotLoadedError,
  RegistrationRefusedError,
  sealRegistrySet,
  swapRegistrySet,
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
