import { describe, expect, it } from 'vitest'
import { withRegistrations } from '../../registries/registrar'
import type { SliceDefinition } from '../../registries/sliceDefinition'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { createBotSession } from '../../systems/bot/botSession'
import { botPurchases } from '../../systems/registries/botPurchases'
import { listBuyableRefs } from '../../systems/registries/buyableRefs'
import { contentOf } from '../../systems/registries/content'
import { itemDescriptionEntryOf } from '../../systems/registries/itemDescriptionEntries'
import { isVehicleItemId } from '../../systems/registries/vehicleLoadout'
import { DRILL_GEAR_ITEMS, techNodeOf, vehicleItemOf } from './systems/drillGearItems'

// H1 (ticket 242): while the eight drill-gear rows are vision rows, the loaded game has no trace
// of them: no store row, no tree node, no item card and no bot purchase. #205 flips them to
// shipped, `side_drills` as a named re-pin exception.

const PLAYER = 'p1'

const LAST_SCHEDULED_PLANET = 40

const ITEM_IDS = DRILL_GEAR_ITEMS.map((item) => item.itemId)

const NODE_IDS = DRILL_GEAR_ITEMS.map((item) => item.node.id)

const LANE_IDS = [...ITEM_IDS, ...NODE_IDS]

/** Player `p1` on the last scheduled planet with money for anything. */
function richStateOnLastPlanet() {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = createBotSession(start, PLAYER)
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex: LAST_SCHEDULED_PLANET } })
  session.submit({ type: 'debug.setMoney', payload: { amount: '1e30' } })
  return session.state()
}

/** What #205 registers, so the probes below are shown to see a registered row. */
const SHIPPED_PROBE: SliceDefinition = {
  id: 'drill-gear',
  register(r) {
    r.content('vehicle-item', DRILL_GEAR_ITEMS.map(vehicleItemOf))
    r.content('tech-node', DRILL_GEAR_ITEMS.map(techNodeOf))
  },
}

const mentionsTheLane = (value: unknown) =>
  LANE_IDS.some((id) => JSON.stringify(value).includes(id))

describe('drill-gear vision rows', () => {
  it('registers no store item or power-up for the drill gear', () => {
    expect(ITEM_IDS.filter(isVehicleItemId)).toEqual([])
    expect(contentOf('vehicle-item').filter(mentionsTheLane)).toEqual([])
    expect(contentOf('power-up').filter(mentionsTheLane)).toEqual([])
  })

  it('puts no node of theirs in the tech tree', () => {
    expect(contentOf('tech-node').filter(mentionsTheLane)).toEqual([])
  })

  it('gives them no item card on any planet up to 40', () => {
    expect(listBuyableRefs(LAST_SCHEDULED_PLANET).filter(mentionsTheLane)).toEqual([])
    const refs = ITEM_IDS.map((id) => ({ kind: 'vehicle-item' as const, id }))
    expect(refs.map(itemDescriptionEntryOf)).toEqual(ITEM_IDS.map(() => null))
  })

  it('leaves the bots nothing of theirs to buy, even rich on planet 40', () => {
    const state = richStateOnLastPlanet()
    const payloads = botPurchases().flatMap((purchase) => purchase.payloadsToTry(state, PLAYER))
    expect(payloads.filter(mentionsTheLane)).toEqual([])
  })

  it('would see the rows once a slice registered them, so the probes above can fail', () => {
    withRegistrations([SHIPPED_PROBE], () => {
      expect(ITEM_IDS.filter(isVehicleItemId)).toEqual(ITEM_IDS)
      expect(contentOf('tech-node').map((node) => node.id)).toEqual([...NODE_IDS].sort())
    })
  })
})
