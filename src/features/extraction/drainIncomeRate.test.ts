import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import { cmp, fromCanonical, toCanonical } from '../../systems/money'
import { incomeCapRowsOf, type IncomeAt } from '../../systems/registries/incomeRates'
import { slice } from './register'
import { drainAtEveryMark, drainForAMinute } from './systems/drainIncomeRate'
import { tripCapAt } from './systems/tripCap'

// The drain's row in the kernel's 15% income-cap check (#385): a minute at its last Mark, every
// charge spent on the band's richest ore, what reaches the hold after the trip cap. It anchors on
// its own item, so it counts once owned.

const AT: IncomeAt = {
  planetIndex: 20,
  band: 4,
  cargoCapacity: 48,
  drillOrePerMinute: fromCanonical('1000'),
}

function drainRowsAt(at: IncomeAt, isAnchorLive: (rowId: string) => boolean) {
  return withRegistrations([slice], () => incomeCapRowsOf(at, isAnchorLive))
}

describe('mineral drain income rate', () => {
  it('reports a minute of the drain at its last Mark once the drain is owned', () => {
    const lastMark = drainAtEveryMark().at(-1)!
    const rows = drainRowsAt(AT, (rowId) => rowId === 'power.mineral_drain')
    expect(rows.map((row) => [row.rateId, toCanonical(row.valuePerMinute)])).toEqual([
      ['extraction.mineral_drain', toCanonical(drainForAMinute(lastMark, 20, 4, 48))],
    ])
  })

  it('never reports more than the trip cap of the hold it is asked at', () => {
    const [row] = drainRowsAt(AT, () => true)
    const cap = tripCapAt(AT.planetIndex, AT.band, AT.cargoCapacity)
    expect(cmp(row.valuePerMinute, cap)).toBeLessThanOrEqual(0)
  })

  it('counts zero while the drain is not owned', () => {
    expect(drainRowsAt(AT, () => false)).toEqual([])
  })
})
