/**
 * What the shoring shot's cells cost (ticket 369; the GD ruling on #157: "each reinforced cell is
 * priced in the current band's ore units", the TD lock: "in ore units of the band where the cell
 * sits"). A shot cell is billed as the first lining of the one metre of tunnel it stands for, at
 * its own band, in the shot's lining type: `casingLiningPrice`, `ceilMilli(k_casing * V(t(p,b)) *
 * 1 m)` times the type's multiplier (decision #76, #113), the same charge casing_cement's lined
 * walls pay (ticket 367). No price of its own lives here, so economy.json stays the one source.
 */
import { MM_PER_METRE } from '../../../constants/physics'
import { casingLiningPrice } from '../../../systems/economy/casingPrices'
import {
  add,
  div,
  fromSafeInteger,
  ZERO_MONEY,
  type BigStat,
  type Money,
} from '../../../systems/money'
import { bandOfTile } from '../../../systems/world/planetGeometry'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { MM_PER_SAMPLE, SAMPLES_PER_TILE } from '../../../systems/world/sampleGrid'
import type { TilePoint } from '../../../systems/world/tileGrid'

/** The lining bill for holding `cells`, each at its own band. */
export function shotCellsPrice(
  params: PlanetParams,
  cells: readonly TilePoint[],
  liningType: string,
): Money {
  return cells.reduce<Money>(
    (total, cell) => add(total, shotCellPrice(params, cell, liningType)),
    ZERO_MONEY,
  )
}

/** One cell's price: one cell's length of first lining at the band where it sits. */
export function shotCellPrice(params: PlanetParams, cell: TilePoint, liningType: string): Money {
  const band = bandOfTile(params, cell.tx, cell.ty)
  return casingLiningPrice(params.planetIndex, band, cellLengthMetres(), liningType)
}

function cellLengthMetres(): BigStat {
  return div(fromSafeInteger(SAMPLES_PER_TILE * MM_PER_SAMPLE), fromSafeInteger(MM_PER_METRE))
}
