import { describe, expect, it } from 'vitest'
import { ECONOMY } from './economy'
import { createFieldReader } from './economyFieldReader'
import {
  cellsMovedPerUse,
  energyPerMovedCell,
  magnetCooldownTicks,
  readMagnetCaps,
} from './magnetCaps'

// The kernel's caps on the terrain magnets family (GD lock on #246, ticket 282).

const CAPS = ECONOMY.magnets

describe('magnet caps', () => {
  it('reads the Vertical caps of the #246 lock from economy.json', () => {
    expect(CAPS).toEqual({
      maxCellsMoved: 8,
      movableCells: 'diggable',
      movedCells: 'conserved',
      cellEnergyFloorBp: 10000,
      cooldownFloorTicks: 600,
      incomeCapBp: 1500,
    })
  })

  it('moves at most the capped cells in one use, and never fewer than none', () => {
    expect(cellsMovedPerUse(CAPS, 3)).toBe(3)
    expect(cellsMovedPerUse(CAPS, CAPS.maxCellsMoved)).toBe(CAPS.maxCellsMoved)
    expect(cellsMovedPerUse(CAPS, 40)).toBe(CAPS.maxCellsMoved)
    expect(cellsMovedPerUse(CAPS, -2)).toBe(0)
  })

  it("never charges a moved cell less than the cell's own dig energy", () => {
    expect(energyPerMovedCell(CAPS, 0, 12)).toBe(12)
    expect(energyPerMovedCell(CAPS, 5, 12)).toBe(12)
    expect(energyPerMovedCell(CAPS, 20, 12)).toBe(20)
  })

  it('holds any Mark cooldown at the 600-tick floor', () => {
    expect(magnetCooldownTicks(CAPS, 1200)).toBe(1200)
    expect(magnetCooldownTicks(CAPS, 552)).toBe(600)
  })

  it('refuses a block that loosens the lock, listing every problem', () => {
    const reader = createFieldReader()
    readMagnetCaps(reader, {
      maxCellsMoved: -1,
      movableCells: 'any',
      movedCells: 'deleted',
      cellEnergyFloorBp: 5000,
      cooldownFloorTicks: 600,
      incomeCapBp: 20000,
    })
    expect(reader.problems).toHaveLength(5)
  })
})
