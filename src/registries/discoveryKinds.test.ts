import { describe, expect, it } from 'vitest'
import {
  canonicalDiscoveryKey,
  discoveryCodecOf,
  discoveryKinds,
  type DiscoveryKey,
} from '../systems/registries/discovery'
import { RegistrationRefusedError } from '../systems/registries/seal'
import { withRegistrations } from './registrar'
import type { SliceDefinition, SliceRegistrar } from './sliceDefinition'

// Two kinds a slice declares the way a slice does. Keeping them here also keeps the kernel honest:
// code written over a closed list of kinds would stop compiling.
declare module '../systems/registries/discovery' {
  interface DiscoveryKinds {
    'probe-relic': 'ids'
    'probe-vein': 'bitset'
  }
}

function sliceOf(id: string, register: (r: SliceRegistrar) => void): SliceDefinition {
  return { id, register }
}

const PROBE = sliceOf('probe', (r) => {
  r.discoveryKind('probe-relic')
  r.discoveryKind('probe-vein', 'bitset')
})

describe('discovery kinds', () => {
  it('types a key of a slice-declared kind and refuses a key of an unknown kind', () => {
    const relic: DiscoveryKey = 'probe-relic:brass-astrolabe'
    // @ts-expect-error: no slice declared a `nonsense` kind
    const unknown: DiscoveryKey = 'nonsense:brass-astrolabe'
    expect([relic, unknown]).toHaveLength(2)
  })

  it('demands the codec of a kind declared with anything but ids', () => {
    const forgetsCodec = sliceOf('probe', (r) => {
      // @ts-expect-error: `probe-vein` is declared `bitset`, so it must say so
      r.discoveryKind('probe-vein')
    })
    expect(forgetsCodec.id).toBe('probe')
  })

  it('lists the kernel kinds and the registered ones, sorted, with their codecs', () => {
    const kinds = withRegistrations([PROBE], () => discoveryKinds())
    expect(kinds).toEqual([
      { id: 'enemy', codec: 'ids' },
      { id: 'hazard', codec: 'ids' },
      { id: 'ore', codec: 'bitset' },
      { id: 'probe-relic', codec: 'ids' },
      { id: 'probe-vein', codec: 'bitset' },
    ])
  })

  it('stores ore as a bitset and a kind declared but never registered as ids', () => {
    const codecs = withRegistrations([], () => [
      discoveryCodecOf('ore'),
      discoveryCodecOf('probe-vein'),
    ])
    expect(codecs).toEqual(['bitset', 'ids'])
  })

  it('refuses a slice registering a kernel kind', () => {
    const claimsOre = sliceOf('probe', (r) => r.discoveryKind('ore', 'bitset'))
    expect(() => withRegistrations([claimsOre], () => undefined)).toThrow(RegistrationRefusedError)
  })

  it('refuses a second slice registering a kind another slice registered', () => {
    const alsoRelic = sliceOf('rival', (r) => r.discoveryKind('probe-relic'))
    expect(() => withRegistrations([PROBE, alsoRelic], () => undefined)).toThrow(
      RegistrationRefusedError,
    )
  })
})

describe('discovery key aliases', () => {
  const ORES = sliceOf('ores', (r) =>
    r.discoveryAliases({
      id: 'ores.kernel-ids',
      aliases: { 'ore:kernel.metal.t1': 'ore:ores.copper' },
    }),
  )

  it('canonicalises an aliased key to the key it is known by now', () => {
    const key = withRegistrations([ORES], () => canonicalDiscoveryKey('ore:kernel.metal.t1'))
    expect(key).toBe('ore:ores.copper')
  })

  it('leaves a key no table maps unchanged', () => {
    const keys = withRegistrations([ORES], () => [
      canonicalDiscoveryKey('ore:ores.copper'),
      canonicalDiscoveryKey('enemy:kernel.metal.t1'),
    ])
    expect(keys).toEqual(['ore:ores.copper', 'enemy:kernel.metal.t1'])
  })

  it('refuses an alias table without the slice prefix', () => {
    const unprefixed = sliceOf('ores', (r) => r.discoveryAliases({ id: 'kernel-ids', aliases: {} }))
    expect(() => withRegistrations([unprefixed], () => undefined)).toThrow(RegistrationRefusedError)
  })
})
