/**
 * The kernel's caps on the terrain magnets family (GD lock on #246, Vertical caps; ticket 282),
 * `magnets` in economy.json:
 *
 * - `maxCellsMoved` (8): diggable cells one use may move, at every Mark.
 * - `movableCells` ("diggable"): only cells the current drill grade could dig, through `canMine`;
 *   never a gated `scratchFloor` cell, the core or a lava pocket.
 * - `movedCells` ("conserved"): a moved cell lands in an open cell, never deleted or duplicated,
 *   and keeps its tier, gate and `bandOrePriceAt`; with no open cell it stays.
 * - `cellEnergyFloorBp` (10000, a whole share): a moved cell costs at least its own dig energy.
 * - `cooldownFloorTicks` (600): no Mark brings a magnet's cooldown under it.
 * - `incomeCapBp` (1500): ore pulled toward the rig counts toward the item's 15% income cap.
 *
 * The magnet effects (#246 builds 2-4) fold their asks through these; nothing reads them in play
 * yet, so every run plays as before.
 */
import { BASIS_POINTS } from '../../constants/balance'
import { readLiteral, type FieldReader } from './economyFieldReader'

/** The cells a magnet may move: those the drill grade could dig (the lock admits no other). */
export type MagnetMovableCells = 'diggable'

/** What happens to a moved cell: it is shifted whole, never lost or copied. */
export type MagnetMovedCells = 'conserved'

export interface MagnetCaps {
  maxCellsMoved: number
  movableCells: MagnetMovableCells
  movedCells: MagnetMovedCells
  cellEnergyFloorBp: number
  cooldownFloorTicks: number
  incomeCapBp: number
}

/** The cells one use moves: what it found, never more than the cap, never fewer than none. */
export function cellsMovedPerUse(caps: MagnetCaps, cellsFound: number): number {
  return Math.max(0, Math.min(caps.maxCellsMoved, Math.floor(cellsFound)))
}

/** A moved cell's energy in quanta: the item's own ask, never under the cell's dig energy. */
export function energyPerMovedCell(
  caps: MagnetCaps,
  askedQuanta: number,
  digEnergyQuanta: number,
): number {
  return Math.max(askedQuanta, Math.ceil((digEnergyQuanta * caps.cellEnergyFloorBp) / BASIS_POINTS))
}

/** A Mark's cooldown, never under the family's tick floor. */
export function magnetCooldownTicks(caps: MagnetCaps, markCooldownTicks: number): number {
  return Math.max(caps.cooldownFloorTicks, markCooldownTicks)
}

export function readMagnetCaps(reader: FieldReader, value: unknown): MagnetCaps {
  const caps = reader.object('magnets', value)
  const whole = (field: string) => reader.safeInteger(`magnets.${field}`, caps[field])
  const read: MagnetCaps = {
    maxCellsMoved: whole('maxCellsMoved'),
    movableCells: readLiteral(reader, 'magnets.movableCells', caps.movableCells, ['diggable']),
    movedCells: readLiteral(reader, 'magnets.movedCells', caps.movedCells, ['conserved']),
    cellEnergyFloorBp: whole('cellEnergyFloorBp'),
    cooldownFloorTicks: whole('cooldownFloorTicks'),
    incomeCapBp: whole('incomeCapBp'),
  }
  recordOutOfRange(reader, read)
  return read
}

function recordOutOfRange(reader: FieldReader, caps: MagnetCaps): void {
  if (caps.maxCellsMoved < 0) reader.record('magnets.maxCellsMoved must be 0 or more')
  if (caps.cellEnergyFloorBp < BASIS_POINTS) {
    reader.record(`magnets.cellEnergyFloorBp must be ${BASIS_POINTS} or more`)
  }
  if (caps.cooldownFloorTicks < 0) reader.record('magnets.cooldownFloorTicks must be 0 or more')
  if (caps.incomeCapBp < 0 || caps.incomeCapBp > BASIS_POINTS) {
    reader.record(`magnets.incomeCapBp must be between 0 and ${BASIS_POINTS}`)
  }
}
