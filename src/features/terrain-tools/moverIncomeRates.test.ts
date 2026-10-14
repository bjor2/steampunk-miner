import { describe, expect, it } from 'vitest'
import { oreTier, oreValue } from '../../systems/economy/oreEconomy'
import { add, cmp, fromCanonical, fromSafeInteger, mul, toCanonical } from '../../systems/money'
import {
  incomeCapRowsOf,
  milestoneIncomeCapRowsOf,
  type IncomeAnchors,
  type IncomeAt,
  type IncomeCapRow,
} from '../../systems/registries/incomeRates'
import { tripCapAt } from '../extraction'
import { lastMarkOf, reachedMilestonesOf } from '../tech-tree'
import { terrainItemNamed } from './systems/itemMagnitude'
import {
  beaconAtFullStack,
  linkedBeaconAtFullStack,
  pocketAtFullStack,
  relocatedValuePerMinute,
  shifterAtFullStack,
} from './systems/moverIncomeRates'
import { markLadderOf } from './systems/terrainItems'

// The movers' rows in the kernel's 15% income-cap check (#385, GD ruling on #212 Q2 (a)): the ore
// value each relocates in a trip of minutes at full stack, after the trip cap, counted once its
// item is owned. The loaded slices register them; extraction registers the trip cap.

const AT: IncomeAt = {
  planetIndex: 10,
  band: 3,
  cargoCapacity: 24,
  drillOrePerMinute: fromCanonical('1000'),
  tripMinutes: fromCanonical('2'),
}

const MOVER_ITEM_IDS = ['consumable.lodestone_beacon', 'power.ore_shifter', 'power.pressure_pocket']

const EVERY_ITEM_OWNED: IncomeAnchors = { isRowLive: () => true, isItemOwned: () => true }

function moverRowsOf(at: IncomeAt, anchors = EVERY_ITEM_OWNED, rowsOf = incomeCapRowsOf) {
  return rowsOf(at, anchors).filter((row) => row.rateId.startsWith('terrain-tools.'))
}

/** Each mover's unclamped trip, with and without its sibling-link. */
function tripsOf(rows: readonly IncomeCapRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.itemId, toCanonical(row.unclampedValuePerTrip)]))
}

/** The sibling the item's last Mark links to; null when its ladder ends before its link. */
function linkedSiblingOf(itemId: string): string | null {
  const ladder = markLadderOf(terrainItemNamed(itemId))
  const reached = reachedMilestonesOf(ladder, lastMarkOf(ladder))
  return reached.find((milestone) => milestone.pattern === 'sibling-link')?.siblingId ?? null
}

describe('mover income rates', () => {
  it('counts the shifter, the pocket lance and the lodestone, never the seam splitter', () => {
    const rows = moverRowsOf(AT)
    expect(rows.map((row) => row.itemId)).toEqual(MOVER_ITEM_IDS)
  })

  it('counts a mover zero while its item is not owned', () => {
    const anchors = {
      isRowLive: () => true,
      isItemOwned: (id: string) => id !== 'power.ore_shifter',
    }
    const rows = moverRowsOf(AT, anchors)
    expect(rows.map((row) => row.itemId)).not.toContain('power.ore_shifter')
  })

  it('reports the hold-arrival value after the trip cap of the hold it is asked at', () => {
    const shifter = moverRowsOf(AT).find((row) => row.itemId === 'power.ore_shifter')!
    const relocated = mul(relocatedValuePerMinute(shifterAtFullStack(), AT), AT.tripMinutes)
    const cap = tripCapAt(AT.planetIndex, AT.band, AT.cargoCapacity)
    const expected = cmp(relocated, cap) > 0 ? cap : relocated
    expect(toCanonical(shifter.unclampedValuePerTrip)).toBe(toCanonical(relocated))
    expect(toCanonical(shifter.valuePerTrip)).toBe(toCanonical(expected))
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

describe('mover income rates with Mark milestones (ticket 278)', () => {
  it('links the shifter to the lodestone beacon and the pocket lance to the seam splitter, the beacon to nothing', () => {
    expect(MOVER_ITEM_IDS.map(linkedSiblingOf)).toEqual([
      null,
      'consumable.lodestone_beacon',
      'consumable.seam_splitter',
    ])
  })

  it("adds the shifter's linked beacon, gathering half the beacon's ore, to the shifter's trip", () => {
    expect(linkedBeaconAtFullStack().oreCellsPerUse * 2).toBe(beaconAtFullStack().oreCellsPerUse)
    const linked = mul(relocatedValuePerMinute(linkedBeaconAtFullStack(), AT), AT.tripMinutes)
    const plain = tripsOf(moverRowsOf(AT))['power.ore_shifter']
    const withLink = tripsOf(moverRowsOf(AT, EVERY_ITEM_OWNED, milestoneIncomeCapRowsOf))
    expect(withLink['power.ore_shifter']).toBe(toCanonical(add(fromCanonical(plain), linked)))
  })

  it("adds nothing for the pocket lance's linked fissure, which moves no ore, nor for the beacon", () => {
    const plain = tripsOf(moverRowsOf(AT))
    const withLink = tripsOf(moverRowsOf(AT, EVERY_ITEM_OWNED, milestoneIncomeCapRowsOf))
    expect(withLink['power.pressure_pocket']).toBe(plain['power.pressure_pocket'])
    expect(withLink['consumable.lodestone_beacon']).toBe(plain['consumable.lodestone_beacon'])
  })
})
