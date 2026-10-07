import { describe, expect, it } from 'vitest'
import { ECONOMY } from './economy'
import { createFieldReader } from './economyFieldReader'
import { aheadEnergyShareOf, foldDrillGear, readDrillGearCaps } from './drillGearCaps'

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
    expect(gear).toEqual({
      aheadCells: 1,
      facingAheadCells: 1,
      aheadAim: 'facing',
      sideCells: 1,
      sideEnergyShareBp: 12000,
      diagonalEnergyShareBp: 10000,
    })
  })

  it('takes the widest side ask instead of adding asks together, in whole cells', () => {
    expect(foldDrillGear([{ sideCells: 1 }, { sideCells: 2 }], CAPS)?.sideCells).toBe(2)
    expect(foldDrillGear([{ sideCells: 1.7 }, { sideCells: -4 }], CAPS)?.sideCells).toBe(1)
  })

  it('aheadCells stays 1 with the twin bit and the reach boom both asking', () => {
    const twinBit = { aheadCells: 1, aheadAim: 'drive' } as const
    const reachBoom = { aheadCells: 1 }
    const gear = foldDrillGear([reachBoom, twinBit], CAPS)
    expect(gear?.aheadCells).toBe(1)
    expect(gear?.aheadAim).toBe('drive')
    expect(foldDrillGear([twinBit, reachBoom], CAPS)).toEqual(gear)
  })

  it('cuts ahead along the facing only for asks the drive does not aim', () => {
    const twinBit = { aheadCells: 1, aheadAim: 'drive' } as const
    expect(foldDrillGear([twinBit], CAPS)?.facingAheadCells).toBe(0)
    expect(foldDrillGear([{ aheadCells: 3 }], CAPS)?.facingAheadCells).toBe(1)
    expect(foldDrillGear([twinBit, { aheadCells: 1 }], CAPS)?.facingAheadCells).toBe(1)
  })

  it('never cuts more ahead along the facing than on a diagonal', () => {
    const asks = [
      [{ aheadCells: 1, aheadAim: 'drive' }],
      [{ aheadCells: 2 }],
      [
        { aheadCells: 1, aheadAim: 'drive' },
        { aheadCells: 4, aheadAim: 'facing' },
      ],
      [{ sideCells: 1 }],
    ] as const
    for (const ask of asks) {
      const gear = foldDrillGear(ask, CAPS)!
      expect(gear.facingAheadCells).toBeLessThanOrEqual(gear.aheadCells)
    }
  })

  it('aims the ahead cells along the facing unless an ask lets the drive aim them', () => {
    expect(foldDrillGear([{ aheadCells: 1 }], CAPS)?.aheadAim).toBe('facing')
    expect(foldDrillGear([{ aheadCells: 1, aheadAim: 'facing' }], CAPS)?.aheadAim).toBe('facing')
    expect(foldDrillGear([{ aheadCells: 1, aheadAim: 'drive' }], CAPS)?.aheadAim).toBe('drive')
  })

  it('adds no cell for an aim alone', () => {
    expect(foldDrillGear([{ aheadAim: 'drive' }], CAPS)).toBeNull()
    expect(foldDrillGear([{ sideCells: 1, aheadAim: 'drive' }], CAPS)?.aheadCells).toBe(0)
  })

  it("charges a diagonal ahead cell at least the side floor, the facing's cell a whole share", () => {
    const gear = foldDrillGear([{ aheadCells: 1, aheadAim: 'drive' }], CAPS)!
    expect(aheadEnergyShareOf(gear, 'facing')).toBe(10000)
    expect(aheadEnergyShareOf(gear, 'left')).toBe(10000)
    const floor = { ...CAPS, sideEnergyShareFloorBp: 15000 }
    const floored = foldDrillGear([{ aheadCells: 1, aheadAim: 'drive' }], floor)!
    expect(aheadEnergyShareOf(floored, 'facing')).toBe(10000)
    expect(aheadEnergyShareOf(floored, 'right')).toBe(15000)
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
