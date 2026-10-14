import { describe, expect, it } from 'vitest'
import { cmp, fromSafeInteger } from '../../../systems/money'
import { INCOME_RATE_REGISTRY, incomeCapRowsOf } from '../../../systems/registries/incomeRates'
import { entriesOf } from '../../../systems/registries/seal'
import { GALLERY_REAMERS_ID } from './drillGearFork'
import { boreCellsPerRow, flankOrePerMinuteOf, WIDE_INCOME_RATE } from './wideIncomeRate'

// Wide's row for the 15% income-cap check (GD lock on #255, ticket 268): the gallery reamers'
// flank cells, scaled from the drill's own ore minute, anchored on the side_drills row it leans on.

const AT = {
  planetIndex: 16,
  band: 1,
  cargoCapacity: 100,
  drillOrePerMinute: fromSafeInteger(3000),
}

describe('drill-gear fork: the Wide income rate', () => {
  it('is registered for the gallery reamers, anchored on side_drills', () => {
    const rates = entriesOf(INCOME_RATE_REGISTRY).filter(
      (rate) => rate.itemId === GALLERY_REAMERS_ID,
    )
    expect(rates).toEqual([WIDE_INCOME_RATE])
    expect(WIDE_INCOME_RATE.anchorRowId).toBe('side_drills')
  })

  it('reads the bore as two cells a row, the 950 mm stamp rounded up', () => {
    expect(boreCellsPerRow()).toBe(2)
  })

  it('earns the drill minute times its two flank cells over the two-cell bore', () => {
    expect(cmp(flankOrePerMinuteOf(AT), fromSafeInteger(3000))).toBe(0)
  })

  it('prints a row only while side_drills is live', () => {
    const rowIds = (isLive: boolean) =>
      incomeCapRowsOf(AT, () => isLive)
        .map((row) => row.rateId)
        .filter((id) => id === WIDE_INCOME_RATE.id)
    expect(rowIds(false)).toEqual([])
    expect(rowIds(true)).toEqual([WIDE_INCOME_RATE.id])
  })
})
