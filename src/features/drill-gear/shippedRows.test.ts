import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../systems/authority/authorityState'
import { createBotSession } from '../../systems/bot/botSession'
import { botPurchases } from '../../systems/registries/botPurchases'
import { contentOf } from '../../systems/registries/content'
import { itemDescriptionEntryOf } from '../../systems/registries/itemDescriptionEntries'
import { attachOf } from '../../systems/registries/vehicleAttach'
import { acceptedSlotsOf } from '../../systems/registries/vehicleLoadout'
import { LOCKED_SCHEDULE } from '../../systems/unlocks/unlockSchedule'
import { iconUrlOf } from '../../ui/vectorIcons'
import { flavourProblemsOf } from '../descriptions'
import { lastMarkOf, type TechNode } from '../tech-tree'
import { cardLinesOf } from './systems/cardLines'
import { DRILL_GEAR_ITEMS, markLadderOf, SHIPPED_DRILL_GEAR } from './systems/drillGearItems'

// #205 on the loaded slices: six drill-gear rows ship as vehicle items, power-ups, tree nodes and
// item cards (#162 acceptance 1), the twin-bit head a seventh with its effect (ticket 280) and the
// dielectric bit the eighth with its shield (ticket 292). The bit was held back (GD lock on #205
// Q3 a) until P25's `magnetic_planets` shipped (spec #258 Q6); it shows from P25 and not before.

const PLAYER = 'p1'

const LAST_SCHEDULED_PLANET = 40

const SHIPPED_IDS = SHIPPED_DRILL_GEAR.map((item) => item.itemId)

const DIELECTRIC_IDS = ['gear.dielectric_bit', 'tech.drill_gear.dielectric_bit']

const MAGNETIC_PLANETS_ROW = 'magnetic_planets'

const ofIds = (entries: readonly { id: string }[]) => entries.map((entry) => entry.id)

const mentionsAny = (ids: readonly string[]) => (value: unknown) =>
  ids.some((id) => JSON.stringify(value).includes(`"${id}"`))

/** Player `p1` on `planetIndex` with money for anything. */
function richStateOn(planetIndex: number) {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = createBotSession(start, PLAYER)
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit({ type: 'debug.setMoney', payload: { amount: '1e30' } })
  return session.state()
}

function researchablePayloads(planetIndex: number = LAST_SCHEDULED_PLANET) {
  const state = richStateOn(planetIndex)
  return botPurchases().flatMap((purchase) => purchase.payloadsToTry(state, PLAYER))
}

function scheduleRowOf(rowId: string) {
  const row = LOCKED_SCHEDULE.rows.find((candidate) => candidate.id === rowId)
  if (row === undefined) throw new RangeError(`no ${rowId} row in stats.json`)
  return row
}

/** A node shows in the tree from its unlock planet (as `magnetGuard.test.ts` reads it). */
const isNodeOnOrBefore = (lastPlanet: number) => (node: TechNode) => node.unlockTier <= lastPlanet

/** The dielectric bit's node in the tree and the research bot's reach, on planets to `last`. */
function dielectricTracesThrough(lastPlanet: number): unknown[] {
  const mentionsTheBit = mentionsAny(DIELECTRIC_IDS)
  return [
    ...contentOf('tech-node').filter(isNodeOnOrBefore(lastPlanet)).filter(mentionsTheBit),
    ...researchablePayloads(lastPlanet).filter(mentionsTheBit),
  ]
}

describe('drill-gear shipped rows', () => {
  it('registers all eight items as vehicle items and power-ups, and eight drill-gear nodes', () => {
    expect(SHIPPED_IDS).toEqual(DRILL_GEAR_ITEMS.map((item) => item.itemId))
    const vehicleItems = ofIds(contentOf('vehicle-item'))
    const powerUps = contentOf('power-up').map((powerUp) => powerUp.itemId)
    expect(SHIPPED_IDS.filter((id) => !vehicleItems.includes(id))).toEqual([])
    expect(SHIPPED_IDS.filter((id) => !powerUps.includes(id))).toEqual([])
    const lane = contentOf('tech-node').filter((node) => node.lane === 'drill-gear')
    expect(lane.map((node) => node.unlocks).sort()).toEqual([...SHIPPED_IDS].sort())
  })

  it('registers the twin-bit node on P19 after the vibratory bit', () => {
    const nodes = contentOf('tech-node')
    expect(nodes.find((node) => node.id === 'tech.drill_gear.twin_bit')).toMatchObject({
      unlockTier: 19,
      prereqs: ['tech.drill_gear.vibratory_bit'],
      unlocks: 'gear.twin_bit',
    })
  })

  it('the dielectric bit is visible from P25 and not before, at its node behind the twin bit', () => {
    const magnetic = scheduleRowOf(MAGNETIC_PLANETS_ROW)
    expect(magnetic).toMatchObject({ planetIndex: 25, status: 'shipped' })
    const node = contentOf('tech-node').find((one) => one.id === 'tech.drill_gear.dielectric_bit')
    expect(node).toMatchObject({
      unlockTier: 27,
      prereqs: ['tech.drill_gear.twin_bit'],
      requiresDiscovery: 'hazard:magnetic',
      unlocks: 'gear.dielectric_bit',
    })
    expect(node!.unlockTier).toBeGreaterThanOrEqual(magnetic.planetIndex)
    expect(dielectricTracesThrough(magnetic.planetIndex - 1)).toEqual([])
    expect(dielectricTracesThrough(node!.unlockTier)).not.toEqual([])
  })

  it('leaves grounded_lining a vision row: only its own ticket flips it', () => {
    expect(scheduleRowOf('grounded_lining')).toMatchObject({ planetIndex: 25, status: 'vision' })
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
})
