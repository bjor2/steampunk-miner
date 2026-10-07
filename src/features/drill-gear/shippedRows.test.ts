import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { createBotSession } from '../../systems/bot/botSession'
import { botPurchases } from '../../systems/registries/botPurchases'
import { listBuyableRefs } from '../../systems/registries/buyableRefs'
import { contentOf } from '../../systems/registries/content'
import { itemDescriptionEntryOf } from '../../systems/registries/itemDescriptionEntries'
import { attachOf } from '../../systems/registries/vehicleAttach'
import { acceptedSlotsOf } from '../../systems/registries/vehicleLoadout'
import { iconUrlOf } from '../../ui/vectorIcons'
import { flavourProblemsOf } from '../descriptions'
import { lastMarkOf } from '../tech-tree'
import { cardLinesOf } from './systems/cardLines'
import { DRILL_GEAR_ITEMS, markLadderOf, SHIPPED_DRILL_GEAR } from './systems/drillGearItems'

// #205 on the loaded slices: six drill-gear rows ship as vehicle items, power-ups, tree nodes and
// item cards (#162 acceptance 1), the twin-bit head a seventh with its effect (ticket 280), while
// the dielectric bit stays held back with no trace in the game (GD lock on #205 Q3 a).

const PLAYER = 'p1'

const LAST_SCHEDULED_PLANET = 40

const SHIPPED_IDS = SHIPPED_DRILL_GEAR.map((item) => item.itemId)

const HELD_BACK = DRILL_GEAR_ITEMS.filter((item) => item.isHeldBack)

const HELD_BACK_IDS = HELD_BACK.flatMap((item) => [item.itemId, item.node.id])

const ofIds = (entries: readonly { id: string }[]) => entries.map((entry) => entry.id)

const mentionsAny = (ids: readonly string[]) => (value: unknown) =>
  ids.some((id) => JSON.stringify(value).includes(`"${id}"`))

/** Player `p1` on the last scheduled planet with money for anything. */
function richStateOnLastPlanet() {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = createBotSession(start, PLAYER)
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex: LAST_SCHEDULED_PLANET } })
  session.submit({ type: 'debug.setMoney', payload: { amount: '1e30' } })
  return session.state()
}

function researchablePayloads() {
  const state = richStateOnLastPlanet()
  return botPurchases().flatMap((purchase) => purchase.payloadsToTry(state, PLAYER))
}

describe('drill-gear shipped rows', () => {
  it('registers seven items as vehicle items and power-ups, and seven drill-gear nodes', () => {
    const vehicleItems = ofIds(contentOf('vehicle-item'))
    const powerUps = contentOf('power-up').map((powerUp) => powerUp.itemId)
    expect(SHIPPED_IDS.filter((id) => !vehicleItems.includes(id))).toEqual([])
    expect(SHIPPED_IDS.filter((id) => !powerUps.includes(id))).toEqual([])
    const lane = contentOf('tech-node').filter((node) => node.lane === 'drill-gear')
    expect(lane.map((node) => node.unlocks).sort()).toEqual([...SHIPPED_IDS].sort())
  })

  it('registers the twin-bit node on P19 after the vibratory bit, the dielectric bit still not', () => {
    const nodes = contentOf('tech-node')
    expect(nodes.find((node) => node.id === 'tech.drill_gear.twin_bit')).toMatchObject({
      unlockTier: 19,
      prereqs: ['tech.drill_gear.vibratory_bit'],
      unlocks: 'gear.twin_bit',
    })
    expect(nodes.filter(mentionsAny(['gear.dielectric_bit']))).toEqual([])
  })

  it('takes each item in its one drill socket at the attach point of that name', () => {
    const rows = SHIPPED_DRILL_GEAR.map((item) => [
      acceptedSlotsOf(item.itemId),
      attachOf(item.itemId),
    ])
    expect(rows).toEqual(SHIPPED_DRILL_GEAR.map((item) => [[item.slot], item.slot]))
  })

  it('gives every shipped item and node an icon that resolves', () => {
    const iconIds = SHIPPED_DRILL_GEAR.flatMap((item) => [item.iconId, item.node.iconId])
    expect(iconIds.filter((id) => iconUrlOf(id) === null)).toEqual([])
  })

  it('keeps every flavour line to the copy rules: no digits, at most 80 characters', () => {
    const problems = SHIPPED_DRILL_GEAR.flatMap((item) => flavourProblemsOf(item.description))
    expect(problems).toEqual([])
  })

  // #243: the plug is codex contact again, so the corer's line says what it is for.
  it("names the codex in the sampling corer's flavour line", () => {
    const corer = SHIPPED_DRILL_GEAR.find((item) => item.itemId === 'gear.sampling_corer')
    expect(corer?.description).toMatch(/\bcodex\b/)
  })

  it('files a card with stat lines and a price for every item at every Mark to its last', () => {
    const uncarded = SHIPPED_IDS.filter(
      (id) => itemDescriptionEntryOf({ kind: 'vehicle-item', id }) === null,
    )
    expect(uncarded).toEqual([])
    const empty = SHIPPED_DRILL_GEAR.flatMap((item) => {
      const marks = Array.from({ length: lastMarkOf(markLadderOf(item)) }, (_, at) => at + 1)
      return marks
        .filter((mark) => cardLinesOf(item.itemId, mark).at(-1)?.label !== 'Price')
        .map((mark) => `${item.itemId} Mark ${mark}`)
    })
    expect(empty).toEqual([])
  })

  it('lets the research bot research the shipped nodes, rich on planet 40', () => {
    const shippedNodeIds = SHIPPED_DRILL_GEAR.map((item) => item.node.id)
    expect(researchablePayloads().filter(mentionsAny(shippedNodeIds))).not.toEqual([])
  })

  it('leaves no trace of the held-back dielectric bit', () => {
    expect(HELD_BACK.map((item) => item.itemId)).toEqual(['gear.dielectric_bit'])
    const isHeldBack = mentionsAny(HELD_BACK_IDS)
    expect(contentOf('vehicle-item').filter(isHeldBack)).toEqual([])
    expect(contentOf('power-up').filter(isHeldBack)).toEqual([])
    expect(contentOf('tech-node').filter(isHeldBack)).toEqual([])
    expect(listBuyableRefs(LAST_SCHEDULED_PLANET).filter(isHeldBack)).toEqual([])
    const refs = HELD_BACK.map((item) => ({ kind: 'vehicle-item' as const, id: item.itemId }))
    expect(refs.map(itemDescriptionEntryOf)).toEqual([null])
    expect(researchablePayloads().filter(isHeldBack)).toEqual([])
  })
})
