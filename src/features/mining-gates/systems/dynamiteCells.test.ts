import { describe, expect, it } from 'vitest'
import type { OreMixEntry, PlanetHistogram } from '../../planet-mix'
import { dynamiteTilesOf, isDynamiteAct } from './dynamiteCells'
import type { CellGate, GateTable } from './gateTable'

function entryOf(typeId: string): OreMixEntry {
  const [family, tier] = typeId.split('_t')
  return { typeId, family, tier: Number(tier), lead: 0, weightBp: 5000, signature: false }
}

function tableOf(bands: [string, CellGate][][]): GateTable {
  return {
    planetIndex: 7,
    bands: bands.map((band) => band.map(([typeId, gate]) => ({ entry: entryOf(typeId), gate }))),
  }
}

function histogramOf(bands: [string, number][][]): PlanetHistogram {
  return {
    planetIndex: 7,
    worldSeed: 1,
    bands: bands.map((types, at) => ({
      band: at + 1,
      oreTiles: types.reduce((sum, [, tiles]) => sum + tiles, 0),
      patches: 1,
      types: types.map(([typeId, tiles]) => ({ typeId, role: '+0', tiles })),
    })),
  }
}

const SHELL: CellGate = { kind: 'dynamite', minCharge: 1 }
const NONE: CellGate = { kind: 'none' }

describe('mining gates: dynamite cells per seed (GD ruling on ticket 237)', () => {
  it("counts only the tiles of types their own band's gate table seals in a shell", () => {
    const table = tableOf([
      [
        ['fossil_t20', SHELL],
        ['metal_t20', NONE],
      ],
      [['fossil_t21', NONE]],
    ])
    const histogram = histogramOf([
      [
        ['fossil_t20', 12],
        ['metal_t20', 40],
      ],
      [
        ['fossil_t21', 9],
        ['fossil_t20', 3],
      ],
    ])
    expect(dynamiteTilesOf(histogram, table)).toBe(12)
  })

  it('reads a dynamite act from its families: Foothold and Fire, in the campaign and endless', () => {
    expect([7, 10, 16, 41, 45, 46].map(isDynamiteAct)).toEqual([true, true, true, true, true, true])
  })

  it('reads Frost, Lodestone and Hollow as acts with no dynamite family', () => {
    expect([22, 28, 34, 40, 42, 43, 44].map(isDynamiteAct)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
  })
})
