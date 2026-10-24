import { describe, expect, it } from 'vitest'
import { fnv1a64Hex } from '../../../systems/authority/stateDigest'
import { systemRosterOf } from './systemRoster'

// The roster goldens (ticket 775, done-when 1 and 8): under one world seed the rosters of systems 2,
// 10 and 1e6 are byte-identical on every run and client. System 2 is spelled out, so a change to a
// draw reads as a change of planet; the other two are digests. A new stream, a new palette row or a
// moved one re-pins them with its ticket; the seed is the lock's date.

const SEED = 20261024

const GOLDEN = {
  system2: 'de7505c374082b47',
  system10: '3654fb2d1671391a',
  system1e6: 'fd4101e5d37e5af5',
}

function digestOf(system: bigint): string {
  return fnv1a64Hex(JSON.stringify(systemRosterOf(SEED, system)))
}

describe('system roster golden', () => {
  it('draws system 2 of seed 20261024 as pinned', () => {
    const roster = systemRosterOf(SEED, 2n)
    expect(
      roster.map((planet) => [
        planet.name,
        planet.look,
        planet.sizeClass,
        planet.surface,
        planet.slot?.id ?? null,
      ]),
    ).toEqual([
      ['Verdigris Ledger 6', 'brass-verdigris', 'XL', 'std', 'vent_flare'],
      ['Tallow Warrant 7', 'brass-verdigris', 'L', 'std', null],
      ['Ember Reach 8', 'ash-plain', 'XL', 'std', 'ferro_sand_sink'],
      ['Soot Drift 9', 'cinder-basalt', 'S', 'std', 'brine_leech'],
      ['Cinder Shoal 10', 'ash-plain', 'M', 'hard', 'cinder_salt'],
    ])
    expect(roster[0].hook).toBe(
      'Entered at folio 6. Ground: riveted plate shale. Pays in cogwork; mind the vent flares.',
    )
    expect(roster[4].hook).toBe(
      'Entered at folio 10. Ground: layered ash strata. Pays in cinder salts.',
    )
    expect(digestOf(2n)).toBe(GOLDEN.system2)
  })

  it('draws systems 10 and 1e6 of seed 20261024 as pinned, the number past the safe range of none', () => {
    expect(digestOf(10n)).toBe(GOLDEN.system10)
    expect(digestOf(1_000_000n)).toBe(GOLDEN.system1e6)
    expect(systemRosterOf(SEED, 1_000_000n).map((planet) => planet.name)).toEqual([
      'Cinder Warrant 4999996',
      'Rime Reach 4999997',
      'Gauss Drift 4999998',
      'Hollow Shoal 4999999',
      'Brass Spindle 5000000',
    ])
  })
})
