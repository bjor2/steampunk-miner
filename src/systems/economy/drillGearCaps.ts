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
import { NO_DRIVE, type DriveSigns } from '../vehicle/driveSigns'
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

/** One side of the bore, as the facing turns: `left` counter-clockwise on screen. */
export type BoreSide = Exclude<AheadBearing, 'facing'>

/**
 * Which sides the side cells cut (TD lock on #276): both, or only the faced side, the one the drive
 * steers toward, latched per cell (`facedSide.ts`), as the side cutters' Mark 3 hold asks.
 */
export type SideAim = 'both' | 'drive'

/** What one slice asks of the drill; a field left out asks nothing. */
export interface DrillGearAsk {
  /** Whole cells cut past the bit, along the bearing `aheadAim` gives. */
  aheadCells?: number
  /** Left out, the ahead cells point along the facing. */
  aheadAim?: AheadAim
  /** Whole cells cut on each side of the bore, or on the faced side alone (`sideAim`). */
  sideCells?: number
  /** Left out, the side cells cut both sides of the bore. */
  sideAim?: SideAim
  /** A drive-aimed side's seed: the push its hold started with, read while no drive names a side. */
  sideSeed?: DriveSigns
  /** Each side cell's energy as a share of the drill's for that cell, in basis points. */
  sideEnergyShareBp?: number
}

/** The drill gear one player's drill cuts with, after the caps. */
export interface DrillGear {
  /** Cells past the bit on a diagonal bearing: every ask's. */
  aheadCells: number
  /**
   * Cells past the bit along the facing: only asks the drive does not aim (the reach boom), so the
   * twin bit with no side pushed cuts as the bare drill (TD lock on #280). Never over `aheadCells`.
   */
  facingAheadCells: number
  aheadAim: AheadAim
  /** Cells on the faced side: every ask's. With no drive-aimed side ask, on both sides. */
  sideCells: number
  /**
   * Cells on the side not faced: only asks that cut both sides, so a hold alone leaves that side
   * standing. Equal to `sideCells` with no drive-aimed side ask; never over it.
   */
  offSideCells: number
  sideAim: SideAim
  /** The drive-aimed ask's seed; no push with none. */
  sideSeed: DriveSigns
  sideEnergyShareBp: number
  /** An ahead cell's energy share on a diagonal bearing: the side floor. */
  diagonalEnergyShareBp: number
}

/**
 * The largest ask of each kind wins (gear never stacks), the ahead cells held to the cap and the
 * side share never under the floor. One ask aiming by the drive aims every ahead cell by it, but a
 * drive-aimed ask cuts ahead only on a diagonal. One side ask aimed by the drive makes the widest
 * side ask the faced side's, and the other side cuts only what the both-sided asks ask (TD lock on
 * #276), so neither side ever cuts more than one ask's cells. null when no ask adds a cell: the
 * drill cuts as before.
 */
export function foldDrillGear(
  asks: readonly DrillGearAsk[],
  caps: DrillGearCaps,
): DrillGear | null {
  const aheadCells = aheadCellsOf(asks, caps)
  const sideCells = largestCellsOf(asks.map((ask) => ask.sideCells))
  if (aheadCells === 0 && sideCells === 0) return null
  return {
    aheadCells,
    facingAheadCells: aheadCellsOf(asks.filter(isFacingAimed), caps),
    aheadAim: aheadAimOf(asks),
    sideCells,
    offSideCells: largestCellsOf(asks.filter(isBothSided).map((ask) => ask.sideCells)),
    sideAim: sideAimOf(asks),
    sideSeed: asks.find(isDriveSided)?.sideSeed ?? NO_DRIVE,
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

function aheadCellsOf(asks: readonly DrillGearAsk[], caps: DrillGearCaps): number {
  return Math.min(caps.aheadCellsMax, largestCellsOf(asks.map((ask) => ask.aheadCells)))
}

function isFacingAimed(ask: DrillGearAsk): boolean {
  return ask.aheadAim !== 'drive'
}

/** The drive aims the ahead cells when any ask lets it; with drive 0 the bearing stays the facing. */
function aheadAimOf(asks: readonly DrillGearAsk[]): AheadAim {
  return asks.some((ask) => ask.aheadAim === 'drive') ? 'drive' : 'facing'
}

function isBothSided(ask: DrillGearAsk): boolean {
  return ask.sideAim !== 'drive'
}

function isDriveSided(ask: DrillGearAsk): boolean {
  return ask.sideAim === 'drive'
}

function sideAimOf(asks: readonly DrillGearAsk[]): SideAim {
  return asks.some(isDriveSided) ? 'drive' : 'both'
}

function sideEnergyShareOf(asks: readonly DrillGearAsk[], caps: DrillGearCaps): number {
  const shares = asks.map((ask) => ask.sideEnergyShareBp ?? 0)
  return Math.max(caps.sideEnergyShareFloorBp, ...shares)
}

/** Whole cells, never below none. */
function largestCellsOf(cells: readonly (number | undefined)[]): number {
  return cells.reduce<number>((largest, next) => Math.max(largest, Math.floor(next ?? 0)), 0)
}
