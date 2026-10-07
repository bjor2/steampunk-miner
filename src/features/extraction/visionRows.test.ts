import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { createBotSession } from '../../systems/bot/botSession'
import { botPurchases } from '../../systems/registries/botPurchases'
import { listBuyableRefs } from '../../systems/registries/buyableRefs'
import { contentOf } from '../../systems/registries/content'
import { itemDescriptionEntryOf } from '../../systems/registries/itemDescriptionEntries'
import { attachOf } from '../../systems/registries/vehicleAttach'
import { acceptedSlotsOf, isVehicleItemId } from '../../systems/registries/vehicleLoadout'
import { iconUrlOf } from '../../ui/vectorIcons'
import { flavourProblemsOf } from '../descriptions'
import { POWER_UP_SLOTS, powerUpOfItem } from '../power-up-core'
import { lastMarkOf } from '../tech-tree'
import { EXTRACTION_ITEMS, markLadderOf, techNodeOf } from './systems/extractionItems'
import { statPreview } from './systems/statPreview'

// #201 ships the mineral drain (#162 acceptance 1 on the loaded slices: an icon that resolves, a
// flavour line with no digits in at most 80 characters, stat lines at every Mark, a label, the
// power-up slots and one attach point). The slurry siphon and the lane's tree nodes stay vision
// rows (H1, ticket 239): no store row, no tree node, no item card and no bot purchase.

const PLAYER = 'p1'
const LAST_SCHEDULED_PLANET = 40
const DRAIN = EXTRACTION_ITEMS.find((item) => item.itemId === 'power.mineral_drain')!
const SIPHON = EXTRACTION_ITEMS.find((item) => item.itemId === 'power.slurry_siphon')!

const VISION_IDS = [SIPHON.itemId, ...EXTRACTION_ITEMS.map((item) => item.node.id)]

/** Player `p1` on the last scheduled planet with money for anything. */
function richStateOnLastPlanet() {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = createBotSession(start, PLAYER)
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex: LAST_SCHEDULED_PLANET } })
  session.submit({ type: 'debug.setMoney', payload: { amount: '1e30' } })
  return session.state()
}

const mentionsAVisionRow = (value: unknown) =>
  VISION_IDS.some((id) => JSON.stringify(value).includes(id))

describe('extraction shipped rows', () => {
  it('registers the mineral drain as a vehicle item, a channel power-up and an item card', () => {
    expect(isVehicleItemId(DRAIN.itemId)).toBe(true)
    expect(powerUpOfItem(DRAIN.itemId)).toMatchObject({
      powerUpClass: 'channel',
      charges: 2,
      cooldownTicks: 900,
      channelTicks: 60,
    })
    expect(itemDescriptionEntryOf({ kind: 'vehicle-item', id: DRAIN.itemId })).not.toBeNull()
  })

  it('gives the drain an icon that resolves and a flavour line within the copy rules', () => {
    expect(iconUrlOf(DRAIN.iconId)).not.toBeNull()
    expect(flavourProblemsOf(DRAIN.description)).toEqual([])
    expect(/\brig\b/i.test(`${DRAIN.name} ${DRAIN.description}`)).toBe(false)
  })

  it('previews the drain stat lines at every Mark to its last, and labels it horizontal', () => {
    const last = lastMarkOf(markLadderOf(DRAIN))
    const marks = Array.from({ length: last }, (_, index) => index + 1)
    expect(marks.filter((mark) => statPreview(DRAIN.itemId, mark, 9)?.lines.length !== 5)).toEqual(
      [],
    )
    expect(techNodeOf(DRAIN).label).toBe('horizontal')
  })

  it('takes the drain in the five power-up slots at exactly one attach point', () => {
    expect(acceptedSlotsOf(DRAIN.itemId)).toEqual(POWER_UP_SLOTS)
    expect(attachOf(DRAIN.itemId)).toBe('slot')
  })
})

describe('extraction vision rows', () => {
  it('registers no store item or power-up for the siphon', () => {
    expect(isVehicleItemId(SIPHON.itemId)).toBe(false)
    expect(contentOf('vehicle-item').filter(mentionsAVisionRow)).toEqual([])
    expect(contentOf('power-up').filter(mentionsAVisionRow)).toEqual([])
  })

  it('puts no node of the lane in the tech tree', () => {
    expect(contentOf('tech-node').filter(mentionsAVisionRow)).toEqual([])
  })

  it('gives the siphon no item card on any planet up to 40', () => {
    expect(listBuyableRefs(LAST_SCHEDULED_PLANET).filter(mentionsAVisionRow)).toEqual([])
    expect(itemDescriptionEntryOf({ kind: 'vehicle-item', id: SIPHON.itemId })).toBeNull()
  })

  it('leaves the bots nothing of the lane to buy, even rich on planet 40', () => {
    const state = richStateOnLastPlanet()
    const payloads = botPurchases().flatMap((purchase) => purchase.payloadsToTry(state, PLAYER))
    expect(payloads.filter(mentionsAVisionRow)).toEqual([])
    expect(payloads.filter((payload) => JSON.stringify(payload).includes(DRAIN.itemId))).toEqual([])
  })
})
