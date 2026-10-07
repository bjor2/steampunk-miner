import { describe, expect, it } from 'vitest'
import { ECONOMY } from './economy'
import { createFieldReader } from './economyFieldReader'
import { foldDrillGear, readDrillGearCaps } from './drillGearCaps'

// The kernel's caps on slice drill gear (GD lock on #205, ticket 234).

const CAPS = ECONOMY.drillGearCaps

describe('drill gear caps', () => {
  it('reads one cell ahead and a whole energy share per side cell from economy.json', () => {
    expect(CAPS).toEqual({ aheadCellsMax: 1, sideEnergyShareFloorBp: 10000 })
  })

  it('cuts as before when no ask adds a cell', () => {
    expect(foldDrillGear([], CAPS)).toBeNull()
    expect(foldDrillGear([{ sideEnergyShareBp: 15000 }, { aheadCells: 0 }], CAPS)).toBeNull()
  })

  it('clamps the cells ahead of the bit to one, however many are asked', () => {
    expect(foldDrillGear([{ aheadCells: 1 }], CAPS)?.aheadCells).toBe(1)
    expect(foldDrillGear([{ aheadCells: 3 }], CAPS)?.aheadCells).toBe(1)
    expect(foldDrillGear([{ aheadCells: 1 }, { aheadCells: 1 }], CAPS)?.aheadCells).toBe(1)
  })

  it('never charges a side cell less than the drill pays for the same cell', () => {
    expect(foldDrillGear([{ sideCells: 1 }], CAPS)?.sideEnergyShareBp).toBe(10000)
    expect(
      foldDrillGear([{ sideCells: 1, sideEnergyShareBp: 5000 }], CAPS)?.sideEnergyShareBp,
    ).toBe(10000)
    expect(foldDrillGear([{ sideCells: 1, sideEnergyShareBp: 0 }], CAPS)?.sideEnergyShareBp).toBe(
      10000,
    )
  })

  it('keeps a side share above the floor, the largest asked', () => {
    const gear = foldDrillGear(
      [{ sideCells: 1, sideEnergyShareBp: 12000 }, { aheadCells: 1 }],
      CAPS,
    )
    expect(gear).toEqual({ aheadCells: 1, sideCells: 1, sideEnergyShareBp: 12000 })
  })

  it('takes the widest side ask instead of adding asks together, in whole cells', () => {
    expect(foldDrillGear([{ sideCells: 1 }, { sideCells: 2 }], CAPS)?.sideCells).toBe(2)
    expect(foldDrillGear([{ sideCells: 1.7 }, { sideCells: -4 }], CAPS)?.sideCells).toBe(1)
  })

  it('refuses a side share floor under a whole share and a negative ahead cap', () => {
    const reader = createFieldReader()
    readDrillGearCaps(reader, { aheadCellsMax: -1, sideEnergyShareFloorBp: 5000 })
    expect(reader.problems).toEqual([
      'drillGearCaps.aheadCellsMax must be 0 or more',
      'drillGearCaps.sideEnergyShareFloorBp must be 10000 or more',
    ])
  })
})
