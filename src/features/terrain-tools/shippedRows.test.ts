import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { createBotSession } from '../../systems/bot/botSession'
import { botPurchases } from '../../systems/registries/botPurchases'
import { listBuyableRefs } from '../../systems/registries/buyableRefs'
import { contentOf } from '../../systems/registries/content'
import { describeItem, type ItemRef } from '../../systems/registries/itemDescriber'
import { itemDescriptionEntryOf } from '../../systems/registries/itemDescriptionEntries'
import { itemSnapshotViewOf } from '../../systems/registries/itemSnapshotView'
import { attachOf } from '../../systems/registries/vehicleAttach'
import { acceptedSlotsOf } from '../../systems/registries/vehicleLoadout'
import { iconUrlOf } from '../../ui/vectorIcons'
import { flavourProblemsOf } from '../descriptions'
import { POWER_UP_SLOTS } from '../power-up-core'
import { lastMarkOf } from '../tech-tree'
import { MAGNET_ITEMS } from './systems/magnetItems'
import { HELD_BACK_ITEM_IDS, SHIPPED_TERRAIN_ITEMS } from './systems/shippedTools'
import { isConsumable, markLadderOf, TERRAIN_ITEMS } from './systems/terrainItems'

// #202 on the loaded slices: the ore-shifter, seam splitter, pressure pocket lance and lodestone
// beacon ship as vehicle items, power-ups, tree nodes and item cards (#162 acceptance 1). Stabiliser
// foam, the cryo binder, shoring props and the strata press stay vision rows with no trace in the
// game, as the GD lock on #205 Q2 and Q3 holds back an item whose mechanic or prerequisite is absent.

const PLAYER = 'p1'

const LAST_SCHEDULED_PLANET = 40

const SHIPPED_IDS = SHIPPED_TERRAIN_ITEMS.map((item) => item.itemId)

const HELD_BACK = TERRAIN_ITEMS.filter((item) => HELD_BACK_ITEM_IDS.includes(item.itemId))

const HELD_BACK_IDS = HELD_BACK.flatMap((item) => [item.itemId, item.node.id])

const ofIds = (entries: readonly { id: string }[]) => entries.map((entry) => entry.id)

const mentionsAny = (ids: readonly string[]) => (value: unknown) =>
  ids.some((id) => JSON.stringify(value).includes(`"${id}"`))

const freshState = () =>
  createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })

/** Player `p1` on the last scheduled planet with money for anything. */
function richStateOnLastPlanet() {
  const session = createBotSession(freshState(), PLAYER)
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex: LAST_SCHEDULED_PLANET } })
  session.submit({ type: 'debug.setMoney', payload: { amount: '1e30' } })
  return session.state()
}

function researchablePayloads() {
  const state = richStateOnLastPlanet()
  return botPurchases().flatMap((purchase) => purchase.payloadsToTry(state, PLAYER))
}

function describedAt(itemId: string, mark: number, planetIndex: number) {
  const ref: ItemRef = { kind: 'vehicle-item', id: itemId }
  const view = itemSnapshotViewOf(freshState(), PLAYER)
  return describeItem(ref, { playerId: PLAYER, planetIndex, level: mark, view })
}

describe('terrain-tools shipped rows', () => {
  it('registers four tools as vehicle items and power-ups, their nodes, the cradle and the magnets', () => {
    expect(SHIPPED_IDS).toEqual([
      'power.ore_shifter',
      'consumable.seam_splitter',
      'power.pressure_pocket',
      'consumable.lodestone_beacon',
    ])
    const vehicleItems = ofIds(contentOf('vehicle-item'))
    const powerUps = contentOf('power-up').map((powerUp) => powerUp.itemId)
    expect(SHIPPED_IDS.filter((id) => !vehicleItems.includes(id))).toEqual([])
    expect(SHIPPED_IDS.filter((id) => !powerUps.includes(id))).toEqual([])
    const lane = contentOf('tech-node').filter((node) => node.lane === 'terrain')
    expect(lane.map((node) => node.unlocks).sort()).toEqual(
      [...SHIPPED_IDS, 'slot.powerup_4', ...MAGNET_ITEMS.map((item) => item.itemId)].sort(),
    )
  })

  it('takes each tool in the power-up slots, with exactly one attach point', () => {
    const rows = SHIPPED_TERRAIN_ITEMS.map((item) => [
      acceptedSlotsOf(item.itemId),
      attachOf(item.itemId),
    ])
    expect(rows).toEqual(SHIPPED_TERRAIN_ITEMS.map((item) => [POWER_UP_SLOTS, item.attach]))
  })

  it('gives every shipped tool and node an icon that resolves', () => {
    const iconIds = SHIPPED_TERRAIN_ITEMS.flatMap((item) => [item.iconId, item.node.iconId])
    expect(iconIds.filter((id) => iconUrlOf(id) === null)).toEqual([])
  })

  it('keeps every flavour line to the copy rules: no digits, at most 80 characters', () => {
    const problems = SHIPPED_TERRAIN_ITEMS.flatMap((item) => flavourProblemsOf(item.description))
    expect(problems).toEqual([])
  })

  it('describes every tool at every Mark to Mastered, with stat lines and a price last', () => {
    expect(
      SHIPPED_IDS.filter((id) => itemDescriptionEntryOf({ kind: 'vehicle-item', id }) === null),
    ).toEqual([])
    const unpriced = SHIPPED_TERRAIN_ITEMS.flatMap((item) => {
      const marks = Array.from({ length: lastMarkOf(markLadderOf(item)) }, (_, at) => at + 1)
      return marks
        .filter((mark) => {
          const lines = describedAt(item.itemId, mark, 10)?.statLines ?? []
          return lines.length < 2 || !lines.at(-1)?.label.startsWith('Price')
        })
        .map((mark) => `${item.itemId} Mark ${mark}`)
    })
    expect(unpriced).toEqual([])
  })

  it('lets the research bot research the nodes of the tools the store sells, rich on planet 40', () => {
    // Ticket 248: the bot researches only a node whose item some slice sells, so the one-offs.
    const soldNodeIds = SHIPPED_TERRAIN_ITEMS.filter((item) => !isConsumable(item)).map(
      (item) => item.node.id,
    )
    expect(researchablePayloads().filter(mentionsAny(soldNodeIds))).not.toEqual([])
  })

  it('leaves no trace of foam, the cryo binder, shoring props or the strata press', () => {
    const isHeldBack = mentionsAny(HELD_BACK_IDS)
    expect(contentOf('vehicle-item').filter(isHeldBack)).toEqual([])
    expect(contentOf('power-up').filter(isHeldBack)).toEqual([])
    expect(contentOf('tech-node').filter(isHeldBack)).toEqual([])
    expect(listBuyableRefs(LAST_SCHEDULED_PLANET).filter(isHeldBack)).toEqual([])
    const refs = HELD_BACK.map((item) => ({ kind: 'vehicle-item' as const, id: item.itemId }))
    expect(refs.map(itemDescriptionEntryOf)).toEqual([null, null, null, null])
    expect(researchablePayloads().filter(isHeldBack)).toEqual([])
  })
})
