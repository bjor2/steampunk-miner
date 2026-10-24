import { describe, expect, it } from 'vitest'
import { fnv1a64Hex } from '../../../systems/authority/stateDigest'
import { systemMaterialPoolsOf } from './materialPool'

// The material pool goldens (ticket 777): under one world seed the pools of systems 2, 10 and 1e6
// are byte-identical on every run and client. System 2's first planet is spelled out kind by kind
// and every planet of it by its shape, so a change to a draw reads as a change of ore; the rest are
// digests. A new stream, a roster or palette row, a moved mix or a new look row re-pins them with its
// ticket; the seed is the lock's date.

const SEED = 20261024

const GOLDEN = {
  system2: '920f06b1c0b3e825',
  system10: 'e2d42bb2caf2497c',
  system1e6: 'a6e57a6dd5298a27',
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
      ['u1', 'metal', '1-3', 'Molten rings Brassvein', 'peridot', null],
      ['u2', 'fossil', '2-5', 'Scorched scales Amberbone', 'step-bismuth', null],
      ['u3', 'crystal', '4-4', 'Powdery prisms Quartzine', 'argentite-grey', null],
      ['r1', 'crystal', '3-5', 'Glinting darts Quartzine', 'ruby-crimson', null],
      ['r2', 'fossil', '4-4', 'Opaline filaments Amberbone', 'ichthyosaur-eye', null],
      ['e1', 'fossil', '3-3', 'Tarnished stems Amberbone', 'aquamarine-sea', null],
      ['e2', 'crystal', '4-4', 'Smoky twins Quartzine', 'magnetite', null],
      ['e3', 'metal', '5-5', 'Webbed rinds Brassvein', 'orichalcum', 29],
      ['m1', 'metal', '4-4', 'Polished shards Brassvein', 'heat-spinel', 30],
      ['m2', 'crystal', '5-5', 'Clear masses Quartzine', 'painite', 32],
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
      ['system2-p1', 'foothold.heavy', 15, ['e3', 'm1', 'm2'], null, 335],
      ['system2-p2', 'foothold.heavy', 15, ['e3', 'm1', 'm2'], 'u1', 335],
      ['system2-p3', 'fire', 15, ['e3', 'm1', 'm2'], null, 335],
      ['system2-p4', 'fire', 15, ['e3', 'm1', 'm2'], null, 335],
      ['system2-p5', 'fire', 15, ['e3', 'm1', 'm2'], 'u1', 335],
    ])
    expect(digestOf(2n)).toBe(GOLDEN.system2)
  })

  it('draws systems 10 and 1e6 of seed 20261024 as pinned', () => {
    expect(digestOf(10n)).toBe(GOLDEN.system10)
    expect(digestOf(1_000_000n)).toBe(GOLDEN.system1e6)
  })
})
