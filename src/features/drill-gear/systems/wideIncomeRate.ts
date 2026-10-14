/**
 * Wide's income rate for the 15% income-cap check (GD lock on #255: "Wide is judged on income per
 * minute under the 15% cap", the `balance:tree` row; the `incomeRates` registry of ticket 384).
 * The gallery reamers move no ore of their own: their flank cells are cut in the bit's own ticks,
 * so what they add is the drill's ore minute scaled by the flank cells each row of the bore gains
 * over the bore's own width. Anchored on `side_drills`, the row Wide leans on.
 *
 * The bore's width is the stamp's diameter in whole cells, rounded up (decision #36's 950 mm
 * radius cuts two cells a row), and each flank of it gains the reamers' cells.
 */
import { DRILL_STAMP_RADIUS_MM } from '../../../constants/balance'
import { MM_PER_METRE } from '../../../constants/physics'
import { div, floorMilli, fromSafeInteger, mul, type Money } from '../../../systems/money'
import type { IncomeAt, IncomeRate } from '../../../systems/registries/incomeRates'
import { forkValueOf, GALLERY_REAMERS_ID, WIDE_LEANED_ROW } from './drillGearFork'

const FLANKS = 2

export const WIDE_INCOME_RATE: IncomeRate = {
  id: 'drill-gear.gallery_reamers',
  itemId: GALLERY_REAMERS_ID,
  anchorRowId: WIDE_LEANED_ROW,
  // The flank cells land in the hold as the drill's own cargo, never through the trip ledger.
  isTripCappedInPlay: false,
  valuePerMinuteAtFullStack: (at) => flankOrePerMinuteOf(at),
}

/** The drill's ore minute times the flank cells a row gains over the bore's cells a row. */
export function flankOrePerMinuteOf(at: IncomeAt): Money {
  const gained = fromSafeInteger(FLANKS * forkValueOf(GALLERY_REAMERS_ID, 'sideCells'))
  return floorMilli(div(mul(at.drillOrePerMinute, gained), fromSafeInteger(boreCellsPerRow())))
}

/** The stamp's diameter in whole cells, rounded up. */
export function boreCellsPerRow(): number {
  return Math.ceil((2 * DRILL_STAMP_RADIUS_MM) / MM_PER_METRE)
}
