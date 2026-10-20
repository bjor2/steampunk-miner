import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import { createBotSession, type BotSession } from '../../../systems/bot/botSession'
import type { CommandIntent } from '../../../systems/authority/authorityCommand'
import { setVehicleLoadoutCommand } from '../../../systems/authority/loadoutCommands'
import {
  continueScriptedSession,
  createScriptedSession,
  GROUND,
  poseAbove,
} from '../../../systems/authority/scriptedSession'
import { vehicleItemBuyRefusal } from '../../../systems/authority/vehicleItemRules'
import { oreValue } from '../../../systems/economy/oreEconomy'
import { paceScale } from '../../../systems/economy/planetEconomy'
import { ceilMilli, fromSafeInteger, mul } from '../../../systems/money'
import { contentOf } from '../../../systems/registries/content'
import { drillGearOf } from '../../../systems/registries/drillGear'
import { vehicleItemOfferOf } from '../../../systems/registries/vehicleItemSales'
import { setPlanetCommand } from '../../../systems/startScenarioCommands'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import { CHOOSE_FORK_COMMAND, FORK_TIER } from '../../tech-tree'
import { press } from '../drillGearTestSession'
import { CUTTERS_AND_BOOM_SOURCE, SIDE_CUTTERS_ID } from './cuttersAndBoom'
import { WIDE_BRANCH } from './drillGearFork'
import { drillGearItemOf } from './drillGearItems'
import {
  SIDE_CUTTER_MARKS,
  SIDE_CUTTERS_MARK_2_ID,
  sideCellsOfMark,
  sideCutterMarkOf,
} from './sideCutterMarks'

// The side cutters' width Mark 2 (GD lock on #308, ticket 620): an owned part that widens the
// switched-on cutters to two side cells a side, Wide's reamers on top to three, priced by money
// alone at the anchor a_n = 13 + 3(n - 1).

const PLAYER = 'p1'
const MARK_2 = sideCutterMarkOf(SIDE_CUTTERS_MARK_2_ID)!
const CUTTERS_NODE = 'tech.drill_gear.side_cutters'
const ONE_OFF_UNITS = 15
const ONE_OFF_BAND = 5

/** Player `p1` on planet 1 with money, docked at the Upgrade bay. */
function richAtUpgradeBay(): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = createBotSession(start, PLAYER)
  session.submit({ type: 'debug.setMoney', payload: { amount: '1e30' } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

/** Researches each node in order; throws on the first one the tree refuses. */
function researchAll(session: BotSession, nodeIds: readonly string[]): void {
  for (const nodeId of nodeIds) {
    const events = session.submit({ type: 'tech-tree.unlock_node', payload: { nodeId } })
    const refused = events.find((event) => event.type === 'tech-tree.TechNodeRefused')
    if (refused !== undefined) throw new Error(`${nodeId} was refused: ${JSON.stringify(refused)}`)
  }
}

/** The cutters slotted and switched on, `owned` owned beside them, the miner over the ground. */
function cuttersOnOwning(owned: readonly string[], setup: readonly CommandIntent[] = []) {
  const session = createScriptedSession()
  setup.forEach((intent) => session.submit(0, intent))
  session.submit(0, setVehicleLoadoutCommand({ 'drill.flank': SIDE_CUTTERS_ID }, owned))
  session.submit(1, poseAbove(GROUND, FACING.down))
  session.submit(2, press('drill.flank'))
  return session
}

/** The same on planet 16 with the lane's Wide branch chosen. */
function wideCuttersOnOwning(owned: readonly string[]) {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: 83921, playerIds: [PLAYER] })
  const session = continueScriptedSession(start)
  const choose = { type: CHOOSE_FORK_COMMAND, payload: { lane: 'drill-gear', branch: WIDE_BRANCH } }
  const setup = [
    setPlanetCommand(FORK_TIER),
    { type: 'debug.setMoney', payload: { amount: '1e30' } },
    choose,
    setVehicleLoadoutCommand({ 'drill.flank': SIDE_CUTTERS_ID }, owned),
  ] as CommandIntent[]
  setup.forEach((intent) => session.submit(0, intent))
  session.submit(1, poseAbove(GROUND, FACING.down))
  session.submit(2, press('drill.flank'))
  return session
}

describe('side cutters width Marks', () => {
  it('reads Mark 2 at two side cells a side from items.balance, one more than Mark 1', () => {
    expect(SIDE_CUTTER_MARKS.map((mark) => [mark.mark, sideCellsOfMark(mark)])).toEqual([[2, 2]])
  })

  it('anchors Mark n at 13 + 3(n - 1), a step of three planets from the side cutters', () => {
    const cutters = drillGearItemOf(SIDE_CUTTERS_ID)!
    expect(cutters.node.unlockTier).toBe(13)
    for (const mark of SIDE_CUTTER_MARKS) {
      expect(mark.node.unlockTier).toBe(13 + 3 * (mark.mark - 1))
    }
  })

  it('prices Mark 2 at 15 V(3(a - 1) + 5) paceScale(a) with a = 16, on every planet', () => {
    const anchor = MARK_2.node.unlockTier
    const value = oreValue(3 * (anchor - 1) + ONE_OFF_BAND)
    const price = ceilMilli(mul(mul(fromSafeInteger(ONE_OFF_UNITS), value), paceScale(anchor)))
    expect(vehicleItemOfferOf(SIDE_CUTTERS_MARK_2_ID)).toEqual({
      name: MARK_2.name,
      price,
    })
  })

  it('registers Mark 2 as an owned item with no slot, behind the side cutters node', () => {
    const item = contentOf('vehicle-item').find((one) => one.id === SIDE_CUTTERS_MARK_2_ID)
    expect(item).toMatchObject({ slots: [], attach: null })
    const node = contentOf('tech-node').find((one) => one.unlocks === SIDE_CUTTERS_MARK_2_ID)
    expect(node).toMatchObject({
      unlockTier: 16,
      prereqs: [CUTTERS_NODE],
      requiresOwned: [SIDE_CUTTERS_ID],
      costKind: 'capability',
    })
    expect(contentOf('power-up').some((one) => one.itemId === SIDE_CUTTERS_MARK_2_ID)).toBe(false)
  })

  it('is researched and bought on planet 1 by money alone, once the cutters are owned', () => {
    const session = richAtUpgradeBay()
    researchAll(session, ['tech.drill_gear.vibratory_bit', CUTTERS_NODE])
    session.submit({ type: 'buyVehicleItem', payload: { itemId: SIDE_CUTTERS_ID } })
    researchAll(session, [MARK_2.node.id])
    expect(vehicleItemBuyRefusal(session.state(), PLAYER, SIDE_CUTTERS_MARK_2_ID)).toBeNull()
    const events = session.submit({
      type: 'buyVehicleItem',
      payload: { itemId: SIDE_CUTTERS_MARK_2_ID },
    })
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'VehicleItemPurchased', itemId: SIDE_CUTTERS_MARK_2_ID }),
    )
  })

  it('cuts one side cell a side with the cutters alone, and two once Mark 2 is owned', () => {
    const bare = cuttersOnOwning([])
    expect(drillGearOf(bare.state(), 'p1')).toMatchObject({ sideCells: 1, offSideCells: 1 })
    const widened = cuttersOnOwning([SIDE_CUTTERS_MARK_2_ID])
    expect(drillGearOf(widened.state(), 'p1')).toMatchObject({
      sideCells: 2,
      offSideCells: 2,
      sideEnergyShareBp: 10000,
    })
  })

  it('asks nothing with Mark 2 owned while the cutters are switched off', () => {
    const session = cuttersOnOwning([SIDE_CUTTERS_MARK_2_ID])
    session.submit(3, press('drill.flank'))
    expect(CUTTERS_AND_BOOM_SOURCE.gearOf(session.state(), 'p1')).toBeNull()
  })

  it("cuts three side cells a side with Wide's reamers on top of Mark 2", () => {
    const session = wideCuttersOnOwning([SIDE_CUTTERS_MARK_2_ID])
    expect(drillGearOf(session.state(), PLAYER)).toMatchObject({ sideCells: 3, offSideCells: 3 })
    const markOne = wideCuttersOnOwning([])
    expect(drillGearOf(markOne.state(), PLAYER)).toMatchObject({ sideCells: 2 })
  })
})
