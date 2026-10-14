/**
 * The resonance whistle's lure (#262 "lure", kernel seam ticket 361, the GD lock on #245): while a
 * lure is live and an enemy stands within its reach, the enemy's path goal is the centre of the
 * lure cell; once it ends, the goal is the vehicle again. Only the first `liveLureCap` live lures
 * (`src/data/aetheric.json`) are heard, so an enemy's step makes at most that many distance
 * checks: a tick is O(enemies x live lures).
 */
import { MM_PER_METRE } from '../../constants/physics'
import AETHERIC_TUNING from '../../data/aetheric.json'
import { distanceSq, isWithinMm, type MillimetrePoint } from '../authority/combat/combatGeometry'
import type { TilePoint } from '../world/tileGrid'

export const LIVE_LURE_CAP = AETHERIC_TUNING.liveLureCap

const HALF_TILE_MM = MM_PER_METRE / 2

export interface Lure {
  /** The cell lured enemies path to. */
  cell: TilePoint
  /** How near the cell's centre, in mm, an enemy must stand to be lured. */
  reachMm: number
  /** The first tick the lure no longer lures. */
  untilTick: number
}

/** Where `enemy` paths at `tick`: the nearest heard lure's cell centre, or null for the vehicle. */
export function lureTargetOf(
  enemy: MillimetrePoint,
  lures: readonly Lure[],
  tick: number,
): MillimetrePoint | null {
  const lure = nearestLureInReach(enemy, heardLuresOf(lures, tick))
  return lure === null ? null : cellCentreMm(lure.cell)
}

/** The first `LIVE_LURE_CAP` lures still live at `tick`, in listed order. */
function heardLuresOf(lures: readonly Lure[], tick: number): readonly Lure[] {
  return lures.filter((lure) => tick < lure.untilTick).slice(0, LIVE_LURE_CAP)
}

/** The nearest lure whose reach takes in `enemy`; the first listed wins a tie. */
function nearestLureInReach(enemy: MillimetrePoint, lures: readonly Lure[]): Lure | null {
  return lures
    .filter((lure) => isWithinMm(enemy, cellCentreMm(lure.cell), lure.reachMm))
    .reduce<Lure | null>(
      (nearest, lure) => (nearest === null || isNearer(enemy, lure, nearest) ? lure : nearest),
      null,
    )
}

function isNearer(enemy: MillimetrePoint, lure: Lure, than: Lure): boolean {
  return distanceSq(enemy, cellCentreMm(lure.cell)) < distanceSq(enemy, cellCentreMm(than.cell))
}

function cellCentreMm(cell: TilePoint): MillimetrePoint {
  return { x: cell.tx * MM_PER_METRE + HALF_TILE_MM, y: cell.ty * MM_PER_METRE + HALF_TILE_MM }
}
