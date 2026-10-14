import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { bandOrePriceAt } from '../../systems/economy/bandOreCost'
import { fromSafeInteger, toCanonical } from '../../systems/money'
import { contentOf } from '../../systems/registries/content'
import { describeItem } from '../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../systems/registries/itemSnapshotView'
import { attachOf } from '../../systems/registries/vehicleAttach'
import { acceptedSlotsOf, isVehicleItemId } from '../../systems/registries/vehicleLoadout'
import { iconUrlOf } from '../../ui/vectorIcons'
import { flavourProblemsOf } from '../descriptions'
import { MAX_WINDUP_TICKS, POWER_UP_SLOTS, powerUpOfItem } from '../power-up-core'
import {
  FORK_TIER,
  lastMarkOf,
  markLadderOfItem,
  mountedGearOf,
  nodeCostOf,
  unlockTierOfItem,
} from '../tech-tree'
import { AETHERIC_ECONOMY } from './systems/aethericEconomy'
import { AETHERIC_FORK, AETHERIC_FORK_NODES } from './systems/aethericFork'
import { AETHERIC_SELLER } from './systems/aethericSales'
import {
  ARC_COIL_DESCRIPTION,
  ARC_COIL_ICON_ID,
  ARC_COIL_ID,
  ARC_COIL_NAME,
} from './systems/arcCoilItem'
import {
  LANTERN_DESCRIPTION,
  LANTERN_ICON_ID,
  LANTERN_ID,
  LANTERN_NAME,
} from './systems/lanternItem'
import { statPreview } from './systems/statPreview'

// The P16 fork pair's rows on the loaded slices (#261, the GD locks on #245 and #255; #162
// acceptance 1): the phase lantern and the galvanic arc coil as power-ups in the five slots, each
// drawn at its own point (the gear rows of #265), their branch nodes on tier 16 carrying their
// Mark ladders, one price through bandOrePriceAt with `tech.mark.<itemId>.<N>` nodes after it, and
// a card. The two branches cost the same at every planet, for the node and for every Mark step.

const LANTERN = AETHERIC_ECONOMY.phaseLantern
const ARC_COIL = AETHERIC_ECONOMY.arcCoil

const ITEMS = [
  {
    itemId: LANTERN_ID,
    name: LANTERN_NAME,
    iconId: LANTERN_ICON_ID,
    description: LANTERN_DESCRIPTION,
    nodeId: 'tech.aetheric.fork.phase',
    point: 'hull.nose',
    balance: LANTERN,
    ladder: { isIncomeItem: false, cooldown: LANTERN.cooldownTicks, charges: LANTERN.charges },
  },
  {
    itemId: ARC_COIL_ID,
    name: ARC_COIL_NAME,
    iconId: ARC_COIL_ICON_ID,
    description: ARC_COIL_DESCRIPTION,
    nodeId: 'tech.aetheric.fork.arc',
    point: 'hull.roof.coils',
    balance: ARC_COIL,
    ladder: {
      isIncomeItem: false,
      cooldown: ARC_COIL.cooldownTicks,
      magnitude: { base: ARC_COIL.rangeTiles },
      charges: ARC_COIL.charges,
    },
  },
]

const view = itemSnapshotViewOf(
  createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] }),
  'p1',
)

const cardAt = (itemId: string, level: number) =>
  describeItem(
    { kind: 'vehicle-item', id: itemId },
    { playerId: 'p1', planetIndex: FORK_TIER, level, view },
  )

const lastMark = (itemId: string) => lastMarkOf(markLadderOfItem(itemId) ?? { isIncomeItem: false })

const markId = (itemId: string, mark: number) => `tech.mark.${itemId}.${mark}`

describe('phase lantern and galvanic arc coil rows', () => {
  it.each(ITEMS)(
    'registers $name as a charged power-up in the five slots, at its own point',
    (item) => {
      expect(isVehicleItemId(item.itemId)).toBe(true)
      expect(acceptedSlotsOf(item.itemId)).toEqual(POWER_UP_SLOTS)
      expect(attachOf(item.itemId)).toBe(item.point)
      expect(mountedGearOf(item.itemId)?.attach).toBe(item.point)
      expect(powerUpOfItem(item.itemId)).toMatchObject({
        powerUpClass: 'charged',
        charges: item.balance.charges,
        cooldownTicks: item.balance.cooldownTicks,
        windupTicks: item.balance.windupTicks,
      })
      expect(item.balance.windupTicks).toBeLessThanOrEqual(MAX_WINDUP_TICKS)
    },
  )

  it('registers the pair as the aetheric lane’s P16 fork, each branch needing the entry node', () => {
    expect(AETHERIC_FORK.lane).toBe('aetheric')
    expect(AETHERIC_FORK.id).toBe('tech.aetheric.fork')
    expect(AETHERIC_FORK_NODES.map((node) => [node.id, node.branch, node.unlocks])).toEqual([
      ['tech.aetheric.fork.phase', 'phase', LANTERN_ID],
      ['tech.aetheric.fork.arc', 'arc', ARC_COIL_ID],
    ])
    const registered = contentOf('tech-node').filter((node) => node.id.startsWith(AETHERIC_FORK.id))
    expect(registered.map((node) => [node.unlockTier, node.costKind, node.prereqs])).toEqual([
      [FORK_TIER, 'capability', ['tech.aetheric.resonance_whistle']],
      [FORK_TIER, 'capability', ['tech.aetheric.resonance_whistle']],
    ])
  })

  it.each(ITEMS)(
    'unlocks $name on P16 through its branch node, which carries its Mark ladder',
    (item) => {
      expect(unlockTierOfItem(item.itemId)).toBe(FORK_TIER)
      expect(markLadderOfItem(item.itemId)).toEqual(item.ladder)
    },
  )

  it('prices the two branches the same, for the node and for every Mark step', () => {
    const [phase, arc] = AETHERIC_FORK_NODES
    const sharedMarks = Math.min(lastMark(LANTERN_ID), lastMark(ARC_COIL_ID))
    expect(sharedMarks).toBeGreaterThan(1)
    expect(toCanonical(nodeCostOf(phase.id)!)).toBe(toCanonical(nodeCostOf(arc.id)!))
    for (let mark = 2; mark <= sharedMarks; mark += 1) {
      expect(toCanonical(nodeCostOf(markId(LANTERN_ID, mark))!), `Mk${mark}`).toBe(
        toCanonical(nodeCostOf(markId(ARC_COIL_ID, mark))!),
      )
    }
  })

  it.each(ITEMS)('sells $name for 15 band-5 ore units at P16, on every planet', (item) => {
    const price = bandOrePriceAt(AETHERIC_ECONOMY.price, FORK_TIER, FORK_TIER)
    expect(AETHERIC_SELLER.offerOf(item.itemId)).toEqual({ name: item.name, price })
  })

  it.each(ITEMS)('prices a tech.mark node for every Mark of $name, and none past it', (item) => {
    const marks = Array.from({ length: lastMark(item.itemId) - 1 }, (_, at) => at + 2)
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.filter((mark) => nodeCostOf(markId(item.itemId, mark)) === null)).toEqual([])
    expect(nodeCostOf(markId(item.itemId, lastMark(item.itemId) + 1))).toBeNull()
  })

  it.each(ITEMS)('cards $name with its flavour and stat lines, as bought and Mastered', (item) => {
    const bought = cardAt(item.itemId, 0)
    const mastered = cardAt(item.itemId, lastMark(item.itemId))
    expect(bought?.flavour).toBe(item.description)
    expect(flavourProblemsOf(item.description)).toEqual([])
    expect(bought?.statLines.map((line) => line.label)).toEqual(
      statPreview(item.itemId, 1, FORK_TIER).map((line) => line.label),
    )
    expect(bought?.statLines[0].next).toBeDefined()
    expect(bought?.statLines.at(-1)?.label).toBe('Price')
    expect(mastered?.statLines.every((line) => line.next === undefined)).toBe(true)
  })

  it('previews the arc coil’s reach as the Mark magnitude and how many enemies a bolt hits', () => {
    const lines = statPreview(ARC_COIL_ID, 1, FORK_TIER)
    expect(lines.find((line) => line.label === 'Reach (tiles)')).toMatchObject({ isMarked: true })
    expect(toCanonical(lines.find((line) => line.label === 'Enemies a bolt')!.value)).toBe(
      toCanonical(fromSafeInteger(ARC_COIL.chainCount + 1)),
    )
  })

  it.each(ITEMS)('gives $name an item icon and a node icon that resolve', (item) => {
    expect(iconUrlOf(item.iconId)).not.toBeNull()
    const node = AETHERIC_FORK_NODES.find((branch) => branch.id === item.nodeId)!
    expect(iconUrlOf(node.iconId)).not.toBeNull()
  })
})
