import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { bandOrePriceAt } from '../../systems/economy/bandOreCost'
import { describeItem } from '../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../systems/registries/itemSnapshotView'
import { attachOf } from '../../systems/registries/vehicleAttach'
import { acceptedSlotsOf, isVehicleItemId } from '../../systems/registries/vehicleLoadout'
import { iconUrlOf } from '../../ui/vectorIcons'
import { flavourProblemsOf } from '../descriptions'
import { MAX_WINDUP_TICKS, POWER_UP_SLOTS, powerUpOfItem } from '../power-up-core'
import { lastMarkOf, markLadderOfItem, nodeCostOf, unlockTierOfItem } from '../tech-tree'
import { AETHERIC_ECONOMY } from './systems/aethericEconomy'
import { AETHERIC_SELLER } from './systems/aethericSales'
import {
  CONDENSER_DESCRIPTION,
  CONDENSER_ICON_ID,
  CONDENSER_ID,
  CONDENSER_NAME,
} from './systems/condenserItem'
import {
  GOVERNOR_DESCRIPTION,
  GOVERNOR_ICON_ID,
  GOVERNOR_ID,
  GOVERNOR_NAME,
} from './systems/governorItem'
import { statPreview } from './systems/statPreview'

// The chronometric governor's and the aether condenser's rows on the loaded slices (#263, the GD
// lock on #245; #162 acceptance 1): power-ups in the five slots drawn at their own points (the
// gear rows of #265), their P24 and P29 nodes carrying their Mark ladders, a one-off price through
// bandOrePriceAt with `tech.mark.<itemId>.<N>` nodes after it, and a card.

const GOVERNOR = AETHERIC_ECONOMY.chronometricGovernor
const CONDENSER = AETHERIC_ECONOMY.aetherCondenser

const ITEMS = [
  {
    itemId: GOVERNOR_ID,
    name: GOVERNOR_NAME,
    iconId: GOVERNOR_ICON_ID,
    description: GOVERNOR_DESCRIPTION,
    planet: 24,
    point: 'hull.tail',
    balance: GOVERNOR,
    ladder: {
      isIncomeItem: false,
      cooldown: GOVERNOR.cooldownTicks,
      magnitude: { base: GOVERNOR.durationTicks },
      charges: GOVERNOR.charges,
    },
  },
  {
    itemId: CONDENSER_ID,
    name: CONDENSER_NAME,
    iconId: CONDENSER_ICON_ID,
    description: CONDENSER_DESCRIPTION,
    planet: 29,
    point: 'hull.flank',
    balance: CONDENSER,
    ladder: { isIncomeItem: false, cooldown: CONDENSER.cooldownTicks, charges: CONDENSER.charges },
  },
]

const view = itemSnapshotViewOf(
  createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] }),
  'p1',
)

const cardAt = (itemId: string, planet: number, level: number) =>
  describeItem(
    { kind: 'vehicle-item', id: itemId },
    { playerId: 'p1', planetIndex: planet, level, view },
  )

const lastMark = (itemId: string) => lastMarkOf(markLadderOfItem(itemId) ?? { isIncomeItem: false })

describe('chronometric governor and aether condenser rows', () => {
  it.each(ITEMS)(
    'registers $name as a charged power-up in the five slots, at its point',
    (item) => {
      expect(isVehicleItemId(item.itemId)).toBe(true)
      expect(acceptedSlotsOf(item.itemId)).toEqual(POWER_UP_SLOTS)
      expect(attachOf(item.itemId)).toBe(item.point)
      expect(powerUpOfItem(item.itemId)).toMatchObject({
        powerUpClass: 'charged',
        charges: item.balance.charges,
        cooldownTicks: item.balance.cooldownTicks,
        windupTicks: item.balance.windupTicks,
      })
      expect(item.balance.windupTicks).toBeLessThanOrEqual(MAX_WINDUP_TICKS)
    },
  )

  it.each(ITEMS)('unlocks $name on its planet through a node carrying its Mark ladder', (item) => {
    expect(unlockTierOfItem(item.itemId)).toBe(item.planet)
    expect(markLadderOfItem(item.itemId)).toEqual(item.ladder)
  })

  it.each(ITEMS)('sells $name for 15 band-5 ore units at its planet, on every planet', (item) => {
    const price = bandOrePriceAt(AETHERIC_ECONOMY.price, item.planet, item.planet)
    expect(AETHERIC_SELLER.offerOf(item.itemId)).toEqual({ name: item.name, price })
  })

  it.each(ITEMS)('prices a tech.mark node for every Mark of $name, and none past it', (item) => {
    const markId = (mark: number) => `tech.mark.${item.itemId}.${mark}`
    const marks = Array.from({ length: lastMark(item.itemId) - 1 }, (_, at) => at + 2)
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.filter((mark) => nodeCostOf(markId(mark)) === null)).toEqual([])
    expect(nodeCostOf(markId(lastMark(item.itemId) + 1))).toBeNull()
  })

  it.each(ITEMS)('cards $name with its flavour and stat lines, as bought and Mastered', (item) => {
    const bought = cardAt(item.itemId, item.planet, 0)
    const mastered = cardAt(item.itemId, item.planet, lastMark(item.itemId))
    expect(bought?.flavour).toBe(item.description)
    expect(flavourProblemsOf(item.description)).toEqual([])
    expect(bought?.statLines.map((line) => line.label)).toEqual(
      statPreview(item.itemId, 1, item.planet).map((line) => line.label),
    )
    expect(bought?.statLines[0].next).toBeDefined()
    expect(bought?.statLines.at(-1)?.label).toBe('Price')
    expect(mastered?.statLines.every((line) => line.next === undefined)).toBe(true)
  })

  it.each(ITEMS)('gives $name an item icon that resolves', (item) => {
    expect(iconUrlOf(item.iconId)).not.toBeNull()
  })
})
