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
import { GATE_ROWS } from '../mining-gates'
import { POWER_UP_SLOTS, powerUpOfItem } from '../power-up-core'
import { lastMarkOf, type TechNode } from '../tech-tree'
import { EXTRACTION_ITEMS, markLadderOf, techNodeOf } from './systems/extractionItems'
import { statPreview } from './systems/statPreview'

// #201 ships the mineral drain (#162 acceptance 1 on the loaded slices: an icon that resolves, a
// flavour line with no digits in at most 80 characters, stat lines at every Mark, a label, the
// power-up slots and one attach point) and the lane's live tree nodes: the five extractors' and
// the drain's (TD lock on #201 Q2). The slurry siphon and its node are held, unregistered (GD
// ruling on Q1): no store row, no tree node, no item card and no bot purchase.

const PLAYER = 'p1'
const LAST_SCHEDULED_PLANET = 40
const DRAIN = EXTRACTION_ITEMS.find((item) => item.itemId === 'power.mineral_drain')!
const SIPHON = EXTRACTION_ITEMS.find((item) => item.itemId === 'power.slurry_siphon')!

const HELD_IDS = [SIPHON.itemId, SIPHON.node.id]

/** The extractor nodes #161 section 1 places, with the family keys of each gate class (#141). */
const EXTRACTOR_NODES = [
  ['tech.extraction.resonance_fork', 4, 'rig.resonance', ['ore:crystal']],
  [
    'tech.extraction.containment_hood',
    11,
    'rig.containment',
    ['ore:radioactive', 'ore:organic', 'ore:energy'],
  ],
  ['tech.extraction.acid_etcher', 18, 'rig.acid_etcher', ['ore:cryo', 'ore:ancient']],
  ['tech.extraction.induction_coil', 25, 'rig.induction', ['ore:relic']],
  ['tech.extraction.aether_tether', 32, 'rig.aether_tether', ['ore:alien', 'ore:exotic']],
] as const

const laneNodes = () =>
  contentOf('tech-node').filter((node) => (node as TechNode).lane === 'extraction') as TechNode[]

/** Player `p1` on the last scheduled planet with money for anything. */
function richStateOnLastPlanet() {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = createBotSession(start, PLAYER)
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex: LAST_SCHEDULED_PLANET } })
  session.submit({ type: 'debug.setMoney', payload: { amount: '1e30' } })
  return session.state()
}

const mentionsAHeldRow = (value: unknown) =>
  HELD_IDS.some((id) => JSON.stringify(value).includes(id))

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

describe('extraction tree nodes', () => {
  it('registers the five extractor nodes and the drain node, and no other of the lane', () => {
    expect(laneNodes().map((node) => node.id)).toEqual(
      [...EXTRACTOR_NODES.map(([id]) => id), DRAIN.node.id].sort(),
    )
  })

  it('places each extractor node on its #161 planet, unlocking its extractor by id', () => {
    const placed = laneNodes()
      .filter((node) => node.unlocks.startsWith('rig.'))
      .map((node) => [node.id, node.unlockTier, node.unlocks, node.requiresDiscovery])
    const expected = EXTRACTOR_NODES.map(([id, tier, rig, keys]) => [
      id,
      tier,
      rig,
      { anyOf: keys },
    ])
    expect(placed).toEqual(expect.arrayContaining(expected))
    expect(placed).toHaveLength(expected.length)
  })

  it('is the node each extractor names, with its name and flavour, no prerequisite and no Marks', () => {
    for (const rig of GATE_ROWS.rigs) {
      const node = laneNodes().find((candidate) => candidate.unlocks === rig.id)
      expect(node).toMatchObject({ id: rig.unlockedBy, name: rig.name, prereqs: [] })
      expect(node?.marks).toBeUndefined()
    }
  })

  it('opens the drain after the Resonance Fork, the node now registered', () => {
    const drain = laneNodes().find((node) => node.id === DRAIN.node.id)
    expect(drain?.prereqs).toEqual(['tech.extraction.resonance_fork'])
    expect(laneNodes().map((node) => node.id)).toContain('tech.extraction.resonance_fork')
  })

  it('gives every node an icon that resolves and a flavour line within the copy rules', () => {
    const problems = laneNodes().flatMap((node) => [
      ...(iconUrlOf(node.iconId) === null ? [`${node.id}: icon ${node.iconId}`] : []),
      ...flavourProblemsOf(node.description).map((problem) => `${node.id}: ${problem}`),
    ])
    expect(problems).toEqual([])
  })
})

describe('extraction held rows', () => {
  it('registers no store item or power-up for the siphon', () => {
    expect(isVehicleItemId(SIPHON.itemId)).toBe(false)
    expect(contentOf('vehicle-item').filter(mentionsAHeldRow)).toEqual([])
    expect(contentOf('power-up').filter(mentionsAHeldRow)).toEqual([])
  })

  it("puts neither the siphon's node nor a node needing it in the tech tree", () => {
    expect(contentOf('tech-node').filter(mentionsAHeldRow)).toEqual([])
  })

  it('gives the siphon no item card on any planet up to 40', () => {
    expect(listBuyableRefs(LAST_SCHEDULED_PLANET).filter(mentionsAHeldRow)).toEqual([])
    expect(itemDescriptionEntryOf({ kind: 'vehicle-item', id: SIPHON.itemId })).toBeNull()
  })

  it('leaves the bots nothing of the siphon to buy or research, even rich on planet 40', () => {
    const state = richStateOnLastPlanet()
    const payloads = botPurchases().flatMap((purchase) => purchase.payloadsToTry(state, PLAYER))
    expect(payloads.filter(mentionsAHeldRow)).toEqual([])
    expect(payloads.filter((payload) => JSON.stringify(payload).includes(DRAIN.itemId))).toEqual([])
  })
})
