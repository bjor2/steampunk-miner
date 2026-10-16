/**
 * The drill's bite on gated cells (ticket 519, the TD ruling 6225185887 on #519): the standing
 * gated cells the last drilling pose report met, raised or left out, from the drill's disc and
 * each gear head's own reach. The next report leaves out a `DrillGated` its bite already raised
 * only while the bite runs on unbroken (`authority/reportedGateBite.ts`); anything else raises it.
 */
import type { TilePoint } from '../world/tileGrid'

export interface GatedBite {
  /** The report's tick; the bite runs on only into the report charged next after it. */
  tick: number
  /** The met cells, sorted by column then row, so a replay and the digest read one order. */
  cells: readonly TilePoint[]
}

/** The bite of a report at `tick` that met `cells`, each once and in order. */
export function gatedBiteOf(tick: number, cells: readonly TilePoint[]): GatedBite {
  const unique = new Map(cells.map((cell) => [keyOfBiteCell(cell), cell]))
  return { tick, cells: [...unique.values()].sort(byColumnThenRow) }
}

/** The vehicle with no bite: the key left out, so its digest is what it was before any gate. */
export function withoutGatedBite<V extends { gatedBite?: GatedBite }>(
  vehicle: V,
): Omit<V, 'gatedBite'> {
  const { gatedBite: _ended, ...rest } = vehicle
  return rest
}

export function keyOfBiteCell({ tx, ty }: TilePoint): string {
  return `${tx},${ty}`
}

function byColumnThenRow(a: TilePoint, b: TilePoint): number {
  return a.tx === b.tx ? a.ty - b.ty : a.tx - b.tx
}
