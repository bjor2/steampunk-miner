import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { fromCanonical, toCanonical } from '../../systems/money'
import { incomeCapRowsOf, type IncomeAt } from '../../systems/registries/incomeRates'
import { slice } from './register'
import { tripCapAt } from './systems/tripCap'

// The kernel's income-cap check clamps every income rate to extraction's trip cap (ticket 384, TD
// lock "K-ir" on #212): the slice registers the clamp, the kernel applies it, neither imports the
// other's rules.

const AT: IncomeAt = {
  planetIndex: 10,
  band: 3,
  cargoCapacity: 24,
  drillOrePerMinute: fromCanonical('1000'),
}

/** A rate far over any trip cap, so its row reads the cap. */
const FLOOD: SliceDefinition = {
  id: 'fake',
  register: (r) =>
    r.incomeRate({
      id: 'fake.flood',
      itemId: 'power.flood',
      anchorRowId: 'side_drills',
      valuePerMinuteAtFullStack: () => fromCanonical('1000000000000'),
    }),
}

describe('extraction trip cap source', () => {
  it('clamps a registered income rate to the trip cap of the planet, band and hold', () => {
    const rows = withRegistrations([slice, FLOOD], () => incomeCapRowsOf(AT, () => true))
    const cap = tripCapAt(AT.planetIndex, AT.band, AT.cargoCapacity)
    expect(rows.map((row) => toCanonical(row.valuePerMinute))).toEqual([toCanonical(cap)])
  })
})
