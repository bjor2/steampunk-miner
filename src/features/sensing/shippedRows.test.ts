import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { listBuyableRefs } from '../../systems/registries/buyableRefs'
import { contentOf } from '../../systems/registries/content'
import { describeItem } from '../../systems/registries/itemDescriber'
import { itemSnapshotViewOf } from '../../systems/registries/itemSnapshotView'
import { attachOf } from '../../systems/registries/vehicleAttach'
import { acceptedSlotsOf, isVehicleItemId } from '../../systems/registries/vehicleLoadout'
import { iconUrlOf } from '../../ui/vectorIcons'
import { flavourProblemsOf } from '../descriptions'
import { powerUpOfItem } from '../power-up-core'
import { lastMarkOf } from '../tech-tree'
import { SENSING_ITEMS } from './systems/sensingCatalogue'
import { HELD_SENSING_ITEM_IDS } from './systems/sensingContent'
import { markLadderOf } from './systems/sensingItems'
import { statPreview } from './systems/statPreview'

// The vision-to-shipped flip (#203, the GD lock on its split) and #162 acceptance 1 for the
// sensing lane, on the loaded slices: six rows ship as vehicle items, power-ups, tree nodes and
// item cards, each with an icon that resolves, a flavour line inside the copy rules, stat lines
// at every Mark, a label, and for a physical item its slots and exactly one attach point. The
// galvanic probe and the void sounder stay held and leave no trace (GD ruling on #203 Q3).

const LAST_SCHEDULED_PLANET = 40

const SHIPPED_IDS = [
  'power.echo_sounder',
  'passive.threat_periscope',
  'passive.assay_lens',
  'passive.hazard_barometer',
  'consumable.flare_mortar',
  'consumable.signal_buoy',
]

const SHIPPED = SENSING_ITEMS.filter((item) => SHIPPED_IDS.includes(item.itemId))

const HELD = SENSING_ITEMS.filter((item) => HELD_SENSING_ITEM_IDS.includes(item.itemId))

const view = itemSnapshotViewOf(
  createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: ['p1'] }),
  'p1',
)

const laneNodeIds = () =>
  contentOf('tech-node')
    .filter((node) => node.lane === 'sensing')
    .map((node) => node.id)

const cardOf = (itemId: string, level: number, planetIndex: number) =>
  describeItem({ kind: 'vehicle-item', id: itemId }, { playerId: 'p1', planetIndex, level, view })

describe('sensing shipped rows', () => {
  it('registers six items as vehicle items and power-ups, each with its tree node', () => {
    expect(SHIPPED_IDS.filter((id) => !isVehicleItemId(id))).toEqual([])
    expect(SHIPPED_IDS.filter((id) => powerUpOfItem(id) === null)).toEqual([])
    expect(laneNodeIds()).toEqual(SHIPPED.map((item) => item.node.id).sort())
  })

  it('holds the galvanic probe and the void sounder: no item, power-up, node or card', () => {
    const heldIds = HELD.flatMap((item) => [item.itemId, item.node.id])
    const mentionsHeld = (value: unknown) =>
      heldIds.some((id) => JSON.stringify(value).includes(id))
    expect(HELD.map((item) => item.itemId)).toEqual(['power.galvanic_probe', 'power.void_sounder'])
    expect(contentOf('vehicle-item').filter(mentionsHeld)).toEqual([])
    expect(contentOf('power-up').filter(mentionsHeld)).toEqual([])
    expect(contentOf('tech-node').filter(mentionsHeld)).toEqual([])
    expect(listBuyableRefs(LAST_SCHEDULED_PLANET).filter(mentionsHeld)).toEqual([])
  })

  it('gives every row and node an icon that resolves', () => {
    const icons = SHIPPED.flatMap((item) => [item.iconId, item.node.iconId])
    expect(icons.filter((iconId) => iconUrlOf(iconId) === null)).toEqual([])
  })

  it('keeps every flavour line to the copy rules: no digits, at most 80 characters, no "rig"', () => {
    const problems = SHIPPED.flatMap((item) => flavourProblemsOf(item.description))
    expect(problems).toEqual([])
    expect(SHIPPED.filter((item) => item.description.length > 80)).toEqual([])
  })

  it('labels every row horizontal, item and node alike', () => {
    const nodes = contentOf('tech-node').filter((node) => node.lane === 'sensing')
    expect(SHIPPED.map((item) => item.label).every((label) => label === 'horizontal')).toBe(true)
    expect(nodes.every((node) => node.label === 'horizontal')).toBe(true)
  })

  it('previews stat lines for every item at every Mark to its last', () => {
    const blank = SHIPPED.flatMap((item) =>
      Array.from({ length: lastMarkOf(markLadderOf(item)) }, (_, at) => at + 1)
        .filter((mark) => (statPreview(item.itemId, mark, 13)?.lines.length ?? 0) === 0)
        .map((mark) => `${item.itemId} Mark ${mark}`),
    )
    expect(blank).toEqual([])
  })

  it('cards each item with its flavour, its stat lines and a price, as bought and Mastered', () => {
    SHIPPED.forEach((item) => {
      const lines = statPreview(item.itemId, 1, 13)!.lines.length
      const bought = cardOf(item.itemId, 0, 13)
      const mastered = cardOf(item.itemId, lastMarkOf(markLadderOf(item)), 13)
      expect(bought?.flavour).toBe(item.description)
      expect(bought?.statLines).toHaveLength(lines + 1)
      expect(bought?.statLines.at(-1)?.label).toMatch(/^Price/)
      expect(mastered?.statLines.every((line) => line.next === undefined)).toBe(true)
    })
  })

  it('takes the echo, the mortar and the buoy in the power-up slots and owns the passives slotless', () => {
    const slotsOf = (id: string) =>
      acceptedSlotsOf(id).filter((slot) => slot.startsWith('powerup.'))
    expect(SHIPPED_IDS.map((id) => slotsOf(id).length)).toEqual([5, 0, 0, 0, 5, 5])
  })

  it('names exactly one attach point per item', () => {
    expect(SHIPPED_IDS.map(attachOf)).toEqual([
      'hull.roof.aft',
      'hull.roof.fore',
      'cab.gauge',
      'cab.gauge',
      'hull.rear',
      'hull.rear',
    ])
  })
})
