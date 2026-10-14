import { describe, expect, it } from 'vitest'
import { TICKS_PER_SECOND } from '../../constants/physics'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { bandOrePriceAt } from '../../systems/economy/bandOreCost'
import { fromSafeInteger, toCanonical } from '../../systems/money'
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
import { statPreview } from './systems/statPreview'
import { WHISTLE_DESCRIPTION, WHISTLE_ICON_ID, WHISTLE_ID } from './systems/whistleItem'

// The resonance whistle's rows on the loaded slices (#262, the GD lock on #245; #162 acceptance 1):
// a power-up in the five slots with its own attach point, its P15 node carrying its Mark ladder, a
// one-off price through bandOrePriceAt with `tech.mark.<itemId>.<N>` nodes after it, and a card.

const WHISTLE = AETHERIC_ECONOMY.resonanceWhistle
const UNLOCK_PLANET = 15
const LATE_PLANET = 40

const view = itemSnapshotViewOf(
  createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] }),
  'p1',
)

const cardAt = (level: number) =>
  describeItem(
    { kind: 'vehicle-item', id: WHISTLE_ID },
    { playerId: 'p1', planetIndex: UNLOCK_PLANET, level, view },
  )

/** Whole seconds of a tick count that divides evenly, as a canonical decimal. */
const canonicalSeconds = (ticks: number) => toCanonical(fromSafeInteger(ticks / TICKS_PER_SECOND))

const lastMark = () => lastMarkOf(markLadderOfItem(WHISTLE_ID) ?? { isIncomeItem: false })

describe('resonance whistle rows', () => {
  it('registers a charged power-up in the five power-up slots, drawn on the boiler stack', () => {
    expect(isVehicleItemId(WHISTLE_ID)).toBe(true)
    expect(acceptedSlotsOf(WHISTLE_ID)).toEqual(POWER_UP_SLOTS)
    expect(attachOf(WHISTLE_ID)).toBe('hull.stack.side')
    expect(powerUpOfItem(WHISTLE_ID)).toMatchObject({
      powerUpClass: 'charged',
      charges: WHISTLE.charges,
      cooldownTicks: WHISTLE.cooldownTicks,
      windupTicks: WHISTLE.windupTicks,
    })
    expect(WHISTLE.windupTicks).toBeLessThanOrEqual(MAX_WINDUP_TICKS)
  })

  it('unlocks on P15 through the lane entry node, which carries its Mark ladder', () => {
    expect(unlockTierOfItem(WHISTLE_ID)).toBe(UNLOCK_PLANET)
    expect(markLadderOfItem(WHISTLE_ID)).toEqual({
      isIncomeItem: false,
      cooldown: WHISTLE.cooldownTicks,
      magnitude: { base: WHISTLE.durationTicks },
      charges: WHISTLE.charges,
    })
  })

  it('sells for 15 band-5 ore units at P15 through bandOrePriceAt, on every planet', () => {
    const price = bandOrePriceAt(AETHERIC_ECONOMY.price, UNLOCK_PLANET, UNLOCK_PLANET)
    ;[UNLOCK_PLANET, LATE_PLANET].forEach((planet) =>
      expect(AETHERIC_SELLER.offerOf(WHISTLE_ID, planet)).toEqual({
        name: 'Resonance whistle',
        price,
      }),
    )
    expect(AETHERIC_SELLER.offerOf('power.phase_lantern', LATE_PLANET)).toBeNull()
  })

  it('prices a tech.mark node for every Mark from 2 to its last, and none past it', () => {
    const markId = (mark: number) => `tech.mark.${WHISTLE_ID}.${mark}`
    const marks = Array.from({ length: lastMark() - 1 }, (_, at) => at + 2)
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.filter((mark) => nodeCostOf(markId(mark), LATE_PLANET) === null)).toEqual([])
    expect(nodeCostOf(markId(lastMark() + 1), LATE_PLANET)).toBeNull()
  })

  it('previews its Mark 1 numbers from the economy file', () => {
    const lines = statPreview(WHISTLE_ID, 1, UNLOCK_PLANET).map((line) => [
      line.label,
      toCanonical(line.value),
    ])
    expect(lines.slice(0, 4)).toEqual([
      ['Cooldown (s)', canonicalSeconds(WHISTLE.cooldownTicks)],
      ['Lure lasts (s)', canonicalSeconds(WHISTLE.durationTicks)],
      ['Charges', toCanonical(fromSafeInteger(WHISTLE.charges))],
      ['Reach (tiles)', toCanonical(fromSafeInteger(WHISTLE.reachTiles))],
    ])
    expect(lines.at(-1)?.[0]).toBe('Price')
  })

  it('cards the whistle with its flavour and stat lines, as bought and Mastered', () => {
    const bought = cardAt(0)
    const mastered = cardAt(lastMark())
    expect(bought?.flavour).toBe(WHISTLE_DESCRIPTION)
    expect(flavourProblemsOf(WHISTLE_DESCRIPTION)).toEqual([])
    expect(bought?.statLines.map((line) => line.label)).toEqual(
      statPreview(WHISTLE_ID, 1, UNLOCK_PLANET).map((line) => line.label),
    )
    expect(bought?.statLines[0].next).toBeDefined()
    expect(mastered?.statLines.every((line) => line.next === undefined)).toBe(true)
  })

  it('has an item icon that resolves', () => {
    expect(iconUrlOf(WHISTLE_ICON_ID)).not.toBeNull()
  })
})
