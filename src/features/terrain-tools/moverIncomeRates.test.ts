import { describe, expect, it } from 'vitest'
import { oreTier, oreValue } from '../../systems/economy/oreEconomy'
import { cmp, fromCanonical, fromSafeInteger, mul, toCanonical } from '../../systems/money'
import { incomeCapRowsOf, type IncomeAt } from '../../systems/registries/incomeRates'
import { tripCapAt } from '../extraction'
import {
  beaconAtFullStack,
  pocketAtFullStack,
  relocatedValuePerMinute,
  shifterAtFullStack,
} from './systems/moverIncomeRates'

// The movers' rows in the kernel's 15% income-cap check (#385, GD ruling on #212 Q2 (a)): the ore
// value each relocates in a minute at full stack, after the trip cap, counted once its item is
// owned. The loaded slices register them; extraction registers the trip cap.

const AT: IncomeAt = {
  planetIndex: 10,
  band: 3,
  cargoCapacity: 24,
  drillOrePerMinute: fromCanonical('1000'),
}

const MOVER_ITEM_IDS = ['consumable.lodestone_beacon', 'power.ore_shifter', 'power.pressure_pocket']

function moverRowsOf(at: IncomeAt, isAnchorLive: (rowId: string) => boolean) {
  return incomeCapRowsOf(at, isAnchorLive).filter((row) => row.rateId.startsWith('terrain-tools.'))
}

describe('mover income rates', () => {
  it('counts the shifter, the pocket lance and the lodestone, never the seam splitter', () => {
    const rows = moverRowsOf(AT, () => true)
    expect(rows.map((row) => row.itemId)).toEqual(MOVER_ITEM_IDS)
  })

  it('counts a mover zero while its item is not owned', () => {
    const rows = moverRowsOf(AT, (rowId) => rowId !== 'power.ore_shifter')
    expect(rows.map((row) => row.itemId)).not.toContain('power.ore_shifter')
  })

  it('reports the hold-arrival value after the trip cap of the hold it is asked at', () => {
    const shifter = moverRowsOf(AT, () => true).find((row) => row.itemId === 'power.ore_shifter')!
    const relocated = relocatedValuePerMinute(shifterAtFullStack(), AT)
    const cap = tripCapAt(AT.planetIndex, AT.band, AT.cargoCapacity)
    const expected = cmp(relocated, cap) > 0 ? cap : relocated
    expect(toCanonical(shifter.valuePerMinute)).toBe(toCanonical(expected))
  })

  it("relocates no more ore a minute than the hold takes, at the band's richest ore", () => {
    const smallHold = { ...AT, cargoCapacity: 2 }
    const richest = oreValue(oreTier(AT.planetIndex, AT.band) + 2)
    const value = relocatedValuePerMinute({ oreCellsPerUse: 40, usesPerMinute: 3 }, smallHold)
    expect(toCanonical(value)).toBe(toCanonical(mul(fromSafeInteger(2), richest)))
  })

  it('moves ore every minute at full stack with each mover', () => {
    const movers = [shifterAtFullStack(), pocketAtFullStack(), beaconAtFullStack()]
    expect(movers.every((mover) => mover.oreCellsPerUse * mover.usesPerMinute > 0)).toBe(true)
  })
})
