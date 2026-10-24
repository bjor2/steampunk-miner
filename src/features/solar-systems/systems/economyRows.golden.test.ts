import { describe, expect, it } from 'vitest'
import { fnv1a64Hex } from '../../../systems/authority/stateDigest'
import { economyRowTextOf, systemEconomyRowsOf } from './economyRows'

// The economy row goldens (ticket 776; the VS input on #775: goldens at s = 2, 10 and 1e6 in
// bignum, the re-baseline named "solar system 2"): under the roster golden's seed the rows of
// systems 2, 10 and 1e6 are byte-identical on every run and client. System 2 is spelled out, so a
// moved row reads as a moved number; the other two are digests. A change to J, k_jump, k_s, a size
// class, the radius rows, V(t) or the gem ladder re-pins them with its ticket.

const SEED = 20261024

const GOLDEN = {
  system2: '3feb99360c00d4f1',
  system10: '1ac67de7e83b413d',
  system1e6: '672ac965d196fff2',
}

function digestOf(system: bigint): string {
  return fnv1a64Hex(JSON.stringify(systemEconomyRowsOf(SEED, system).map(economyRowTextOf)))
}

describe('system economy rows golden: solar system 2', () => {
  it('rows system 2 of seed 20261024 as pinned', () => {
    const rows = systemEconomyRowsOf(SEED, 2n).map(economyRowTextOf)
    expect(
      rows.map((row) => [
        row.campaignIndex,
        row.sizeClass,
        row.surface,
        row.radiusTiles,
        row.bandTiers[0],
        row.gemSaleTiers,
        row.hardnessStep,
        row.arrivalStep,
        row.arrivalFee,
      ]),
    ).toEqual([
      ['6', 'XL', 'std', 737, 16, [29, 30, 32], '1.1e+0', '1.1e+0', '4.5978859e+4'],
      ['7', 'L', 'std', 705, 19, [32, 33, 35], '1.1e+0', '1e+0', '1.10841892e+5'],
      ['8', 'XL', 'std', 797, 22, [35, 36, 38], '1.1e+0', '1e+0', '3.74091383e+5'],
      ['9', 'S', 'std', 617, 25, [38, 39, 41], '1.1e+0', '1e+0', '1.262558415e+6'],
      ['10', 'M', 'hard', 703, 28, [41, 42, 44], '1.21e+0', '1.1e+0', '4.26113465e+6'],
    ])
    expect(rows.map((row) => row.poolStep.slice(0, 8))).toEqual([
      '5.412062',
      '3.088282',
      '4.313325',
      '2.022681',
      '4.381412',
    ])
    expect(digestOf(2n)).toBe(GOLDEN.system2)
  })

  it('rows systems 10 and 1e6 of seed 20261024 as pinned, finite in bignum', () => {
    expect(digestOf(10n)).toBe(GOLDEN.system10)
    expect(digestOf(1_000_000n)).toBe(GOLDEN.system1e6)
  })
})
