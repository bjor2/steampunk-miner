/**
 * The kernel's caps on what slice drill gear adds to the drill's cut (GD lock on #205, ticket 234),
 * `drillGearCaps` in economy.json:
 *
 * - `aheadCellsMax` (1): the reach boom's cells past the bit, held to one until the drill-track
 *   curve is re-derived.
 * - `sideEnergyShareFloorBp` (10000, a whole share): a side cell costs at least the drill's own
 *   energy for that cell, so side drilling adds reach, not free throughput.
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

/** What one slice asks of the drill; a field left out asks nothing. */
export interface DrillGearAsk {
  /** Whole cells cut past the bit, along its facing. */
  aheadCells?: number
  /** Whole cells cut on each side of the bore. */
  sideCells?: number
  /** Each side cell's energy as a share of the drill's for that cell, in basis points. */
  sideEnergyShareBp?: number
}

/** The drill gear one player's drill cuts with, after the caps. */
export interface DrillGear {
  aheadCells: number
  sideCells: number
  sideEnergyShareBp: number
}

/**
 * The largest ask of each kind wins (gear never stacks), the ahead cells held to the cap and the
 * side share never under the floor. null when no ask adds a cell: the drill cuts as before.
 */
export function foldDrillGear(
  asks: readonly DrillGearAsk[],
  caps: DrillGearCaps,
): DrillGear | null {
  const aheadCells = Math.min(caps.aheadCellsMax, largestCellsOf(asks.map((ask) => ask.aheadCells)))
  const sideCells = largestCellsOf(asks.map((ask) => ask.sideCells))
  if (aheadCells === 0 && sideCells === 0) return null
  const shares = asks.map((ask) => ask.sideEnergyShareBp ?? 0)
  return {
    aheadCells,
    sideCells,
    sideEnergyShareBp: Math.max(caps.sideEnergyShareFloorBp, ...shares),
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

/** Whole cells, never below none. */
function largestCellsOf(cells: readonly (number | undefined)[]): number {
  return cells.reduce<number>((largest, next) => Math.max(largest, Math.floor(next ?? 0)), 0)
}
