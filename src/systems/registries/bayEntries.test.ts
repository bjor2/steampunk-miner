import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { entryProbeSlice, probeSourceOf } from './bayEntryFixtures'
import { RegistrationRefusedError } from './seal'

// The bay entries seal (ticket 344, TD lock on #314 section 1): an anchor must be a row of the
// locked schedule, and no id may name an unlock id.

describe('the bay entries seal (ticket 344)', () => {
  it('refuses a source anchored on no schedule row', () => {
    const { source } = probeSourceOf('entry-probe.tracks', 'no_such_row', [])
    expect(() => withRegistrations([entryProbeSlice([source])], () => null)).toThrow(
      /waits on "no_such_row", no schedule row/,
    )
  })

  it('refuses a source whose id names an unlock id', () => {
    const { source } = probeSourceOf('entry-probe.bore_gun', 'bore_gun', [])
    expect(() => withRegistrations([entryProbeSlice([source])], () => null)).toThrow(
      RegistrationRefusedError,
    )
  })

  it('takes a scheduled anchor and plain ids', () => {
    const { source } = probeSourceOf('entry-probe.tracks', 'bore_gun', [])
    expect(withRegistrations([entryProbeSlice([source])], () => 'sealed')).toBe('sealed')
  })
})
