/**
 * The kernel's caps on what slice drill gear adds to the drill's cut (GD lock on #205, ticket 234),
 * `drillGearCaps` in economy.json:
 *
 * - `aheadCellsMax` (1): the reach boom's cells past the bit, held to one until the drill-track
 *   curve is re-derived.
 * - `sideEnergyShareFloorBp` (10000, a whole share): a side cell costs at least the drill's own
 *   energy for that cell, so side drilling adds reach, not free throughput. The twin bit's
 *   diagonal ahead cell carries the same floor (GD lock on #257, ticket 279).
 *
 * A slice states the gear it wants; the kernel folds every answer through these caps, so no stack
 * of gear passes them.
 */
import { BASIS_POINTS } from '../../constants/balance'
import type { FieldReader } from './economyFieldReader'

export interface DrillGearCaps {
  aheadCellsMax: number
  sideEnergyShareFloorBp: number
}

/**
 * Where the ahead cells point (GD lock on #257): along the facing, or 45 degrees to the facing's
 * left (counter-clockwise on screen) or right. A diagonal replaces the ahead cell, never adds one.
 */
export type AheadBearing = 'facing' | 'left' | 'right'

/**
 * Who points the ahead cells: the facing alone, or the drive (the twin bit, TD lock on #279): the
 * authority turns them from the reported drive side and latches the bearing per cell.
 */
export type AheadAim = 'facing' | 'drive'

/** What one slice asks of the drill; a field left out asks nothing. */
export interface DrillGearAsk {
  /** Whole cells cut past the bit, along the bearing `aheadAim` gives. */
  aheadCells?: number
  /** Left out, the ahead cells point along the facing. */
  aheadAim?: AheadAim
  /** Whole cells cut on each side of the bore. */
  sideCells?: number
  /** Each side cell's energy as a share of the drill's for that cell, in basis points. */
  sideEnergyShareBp?: number
}

/** The drill gear one player's drill cuts with, after the caps. */
export interface DrillGear {
  aheadCells: number
  aheadAim: AheadAim
  sideCells: number
  sideEnergyShareBp: number
  /** An ahead cell's energy share on a diagonal bearing: the side floor. */
  diagonalEnergyShareBp: number
}

/**
 * The largest ask of each kind wins (gear never stacks), the ahead cells held to the cap and the
 * side share never under the floor. One ask aiming by the drive aims every ahead cell by it. null
 * when no ask adds a cell: the drill cuts as before.
 */
export function foldDrillGear(
  asks: readonly DrillGearAsk[],
  caps: DrillGearCaps,
): DrillGear | null {
  const aheadCells = Math.min(caps.aheadCellsMax, largestCellsOf(asks.map((ask) => ask.aheadCells)))
  const sideCells = largestCellsOf(asks.map((ask) => ask.sideCells))
  if (aheadCells === 0 && sideCells === 0) return null
  return {
    aheadCells,
    aheadAim: aheadAimOf(asks),
    sideCells,
    sideEnergyShareBp: sideEnergyShareOf(asks, caps),
    diagonalEnergyShareBp: caps.sideEnergyShareFloorBp,
  }
}

export function readDrillGearCaps(reader: FieldReader, value: unknown): DrillGearCaps {
  const caps = reader.object('drillGearCaps', value)
  const aheadCellsMax = reader.safeInteger('drillGearCaps.aheadCellsMax', caps.aheadCellsMax)
  const sideEnergyShareFloorBp = reader.safeInteger(
    'drillGearCaps.sideEnergyShareFloorBp',
    caps.sideEnergyShareFloorBp,
  )
  if (aheadCellsMax < 0) reader.record('drillGearCaps.aheadCellsMax must be 0 or more')
  if (sideEnergyShareFloorBp < BASIS_POINTS) {
    reader.record(`drillGearCaps.sideEnergyShareFloorBp must be ${BASIS_POINTS} or more`)
  }
  return { aheadCellsMax, sideEnergyShareFloorBp }
}

/**
 * An ahead cell's energy share on `bearing`: a whole one along the facing; a diagonal cell is cut
 * beside the bit's line, so it pays at least what a side cell does.
 */
export function aheadEnergyShareOf(gear: DrillGear, bearing: AheadBearing): number {
  return bearing === 'facing' ? BASIS_POINTS : gear.diagonalEnergyShareBp
}

/** The drive aims the ahead cells when any ask lets it; the twin bit with drive 0 cuts along the facing. */
function aheadAimOf(asks: readonly DrillGearAsk[]): AheadAim {
  return asks.some((ask) => ask.aheadAim === 'drive') ? 'drive' : 'facing'
}

function sideEnergyShareOf(asks: readonly DrillGearAsk[], caps: DrillGearCaps): number {
  const shares = asks.map((ask) => ask.sideEnergyShareBp ?? 0)
  return Math.max(caps.sideEnergyShareFloorBp, ...shares)
}

/** Whole cells, never below none. */
function largestCellsOf(cells: readonly (number | undefined)[]): number {
  return cells.reduce<number>((largest, next) => Math.max(largest, Math.floor(next ?? 0)), 0)
}
