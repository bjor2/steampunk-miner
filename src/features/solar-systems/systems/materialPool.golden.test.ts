import { describe, expect, it } from 'vitest'
import { fnv1a64Hex } from '../../../systems/authority/stateDigest'
import { systemMaterialPoolsOf } from './materialPool'

// The material pool goldens (ticket 777): under one world seed the pools of systems 2, 10 and 1e6
// are byte-identical on every run and client. System 2's first planet is spelled out kind by kind
// and every planet of it by its shape, so a change to a draw reads as a change of ore; the rest are
// digests. A new stream, a roster or palette row, a moved mix or a new look row re-pins them with its
// ticket; the seed is the lock's date. Ticket 888 re-pinned them for each run's least kinds under
// the VS's band-trip bounds: a swapped band 3's fossil common splits in two (c5, c6).

const SEED = 20261024

const GOLDEN = {
  system2: 'a7efbdc1953b2f2c',
  system10: 'c2fead4c4648da0e',
  system1e6: '06f390e848eb3691',
}

function digestOf(system: bigint): string {
  return fnv1a64Hex(JSON.stringify(systemMaterialPoolsOf(SEED, system)))
}

describe('material pool golden', () => {
  it('draws planet 2.1 of seed 20261024 kind by kind as pinned', () => {
    const [pool] = systemMaterialPoolsOf(SEED, 2n)
    expect(
      pool.kinds.map((kind) => [
        kind.slot,
        kind.family,
        kind.window.join('-'),
        kind.name,
        kind.hueSlot,
        kind.gemSaleTier,
      ]),
    ).toEqual([
      ['c1', 'crystal', '1-5', 'Grooved cobbles Quartzine', 'leviathan-rib', null],
      ['c2', 'crystal', '1-5', 'Petalled spirals Quartzine', 'star-garnet', null],
      ['c3', 'metal', '2-4', 'Nodular barrels Brassvein', 'flint-glass', null],
      ['c4', 'metal', '2-4', 'Charred sprays Brassvein', 'saurian-vertebra', null],
      ['c5', 'fossil', '3-3', 'Blued flecks Amberbone', 'rust-ochre', null],
      ['c6', 'fossil', '3-3', 'Molten rings Amberbone', 'peridot', null],
      ['u1', 'metal', '1-3', 'Scorched scales Brassvein', 'step-bismuth', null],
      ['u2', 'fossil', '2-5', 'Powdery prisms Amberbone', 'argentite-grey', null],
      ['u3', 'crystal', '4-4', 'Glinting darts Quartzine', 'ruby-crimson', null],
      ['r1', 'crystal', '3-5', 'Opaline filaments Quartzine', 'ichthyosaur-eye', null],
      ['r2', 'fossil', '4-4', 'Tarnished stems Amberbone', 'aquamarine-sea', null],
      ['e1', 'fossil', '3-3', 'Smoky twins Amberbone', 'magnetite', null],
      ['e2', 'crystal', '4-4', 'Webbed rinds Quartzine', 'orichalcum', null],
      ['e3', 'metal', '5-5', 'Polished shards Brassvein', 'heat-spinel', 29],
      ['m1', 'metal', '4-4', 'Clear masses Brassvein', 'painite', 30],
      ['m2', 'crystal', '5-5', 'Watered plates Quartzine', 'jet-black', 32],
    ])
  })

  it('draws every planet of system 2 of seed 20261024 as pinned', () => {
    expect(
      systemMaterialPoolsOf(SEED, 2n).map((pool) => [
        pool.id,
        pool.act,
        pool.kinds.length,
        pool.kinds.filter((kind) => kind.gemSaleTier !== null).map((kind) => kind.slot),
        pool.kinds.find((kind) => kind.newFamily !== null)?.slot ?? null,
        pool.gemValueShareBp,
      ]),
    ).toEqual([
      ['system2-p1', 'foothold.heavy', 16, ['e3', 'm1', 'm2'], null, 335],
      ['system2-p2', 'foothold.heavy', 16, ['e3', 'm1', 'm2'], 'u1', 335],
      ['system2-p3', 'fire', 17, ['e3', 'm1', 'm2'], null, 335],
      ['system2-p4', 'fire', 17, ['e3', 'm1', 'm2'], null, 335],
      ['system2-p5', 'fire', 15, ['e3', 'm1', 'm2'], 'u1', 335],
    ])
    expect(digestOf(2n)).toBe(GOLDEN.system2)
  })

  it('draws systems 10 and 1e6 of seed 20261024 as pinned', () => {
    expect(digestOf(10n)).toBe(GOLDEN.system10)
    expect(digestOf(1_000_000n)).toBe(GOLDEN.system1e6)
  })
})
