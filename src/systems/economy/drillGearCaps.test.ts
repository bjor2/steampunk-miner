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
    expect(gear).toEqual({
      aheadCells: 1,
      aheadBearing: 'facing',
      aheadEnergyShareBp: 10000,
      sideCells: 1,
      sideEnergyShareBp: 12000,
    })
  })

  it('takes the widest side ask instead of adding asks together, in whole cells', () => {
    expect(foldDrillGear([{ sideCells: 1 }, { sideCells: 2 }], CAPS)?.sideCells).toBe(2)
    expect(foldDrillGear([{ sideCells: 1.7 }, { sideCells: -4 }], CAPS)?.sideCells).toBe(1)
  })

  it('aheadCells stays 1 with the twin bit and the reach boom both asking', () => {
    const twinBit = { aheadCells: 1, aheadBearing: 'left' } as const
    const reachBoom = { aheadCells: 1 }
    const gear = foldDrillGear([reachBoom, twinBit], CAPS)
    expect(gear?.aheadCells).toBe(1)
    expect(gear?.aheadBearing).toBe('left')
    expect(foldDrillGear([twinBit, reachBoom], CAPS)).toEqual(gear)
  })

  it('points the ahead cells along the facing unless one diagonal is asked', () => {
    expect(foldDrillGear([{ aheadCells: 1 }], CAPS)?.aheadBearing).toBe('facing')
    expect(foldDrillGear([{ aheadCells: 1, aheadBearing: 'right' }], CAPS)?.aheadBearing).toBe(
      'right',
    )
    const opposite = foldDrillGear(
      [
        { aheadCells: 1, aheadBearing: 'left' },
        { aheadCells: 1, aheadBearing: 'right' },
      ],
      CAPS,
    )
    expect(opposite?.aheadBearing).toBe('facing')
  })

  it('adds no cell for a bearing alone', () => {
    expect(foldDrillGear([{ aheadBearing: 'left' }], CAPS)).toBeNull()
    expect(foldDrillGear([{ sideCells: 1, aheadBearing: 'left' }], CAPS)?.aheadCells).toBe(0)
  })

  it("charges a diagonal ahead cell at least the side floor, the facing's cell a whole share", () => {
    expect(foldDrillGear([{ aheadCells: 1 }], CAPS)?.aheadEnergyShareBp).toBe(10000)
    const floor = { ...CAPS, sideEnergyShareFloorBp: 15000 }
    expect(foldDrillGear([{ aheadCells: 1 }], floor)?.aheadEnergyShareBp).toBe(10000)
    expect(
      foldDrillGear([{ aheadCells: 1, aheadBearing: 'left' }], floor)?.aheadEnergyShareBp,
    ).toBe(15000)
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
