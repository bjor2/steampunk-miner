import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { isTravelSetByDrill } from '../authority/travelSpeed'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { stepOfMajor } from '../economy/upgradeSteps'
import { onCurveLevel, onCurveStep } from '../economy/vehicleStats'
import { leadCeiling } from './botCoreRule'
import { buyUpgrades } from './botShopping'
import { createBotSession, type BotSession } from './botSession'
import { paramsOfSession } from './botWorld'
import { newMineLayout } from './mineLayout'

const WORLD_SEED = 83921
/** More money than any planet's tracks can absorb. */
const DEEP_WALLET = '1e15'

/** The bot docked at the Upgrade bay of planet `planetIndex`, with money to spare. */
function botAtUpgradeBayOn(planetIndex: number): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit({ type: 'debug.setMoney', payload: { amount: DEEP_WALLET } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

/** Steps that cut every band at the tile floor, so k times the cut passes the engine everywhere. */
function withDrillSettingTravelEverywhere(session: BotSession): void {
  session.submit({ type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 2000 } })
  session.submit({ type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 600 } })
}

/** Shops with the core as the goal, so the forced core rule leads. */
function shopForTheCore(session: BotSession): void {
  const site = dockSiteOfPlanet(session.state().planet)!
  buyUpgrades(session, {
    layout: newMineLayout(paramsOfSession(session.state()), site),
    isCoreTheGoal: true,
    gunPolicy: 'never',
    hasMetBlastTile: false,
    restockSize: 1,
    chainPolicy: 'click',
  })
}

describe('bot: shopping at the Upgrade bay', () => {
  it('buys one step a command, so a dock visit chains pips and big level-ups (#180)', () => {
    const session = botAtUpgradeBayOn(2)
    const before = session.vehicle().levels
    shopForTheCore(session)
    const buys = session.commands().filter((command) => command.type === 'buyUpgrade')
    const after = session.vehicle().levels
    const stepsBought = UPGRADE_IDS.reduce((total, id) => total + after[id] - before[id], 0)
    expect(buys.length).toBe(stepsBought)
    expect(stepsBought).toBeGreaterThan(stepOfMajor(1))
  })

  it('sends no track buy the Upgrade bay refuses, the engine maxed by a drill that sets travel (ticket 396)', () => {
    const session = botAtUpgradeBayOn(2)
    withDrillSettingTravelEverywhere(session)
    shopForTheCore(session)
    expect(isTravelSetByDrill(session.state(), session.playerId)).toBe(true)
    expect(session.events().filter((event) => event.type === 'CommandRejected')).toEqual([])
  })

  // #418: the lead-capped planet 2 drill passes the engine in band 1 but not in the hardest band.
  it('buys the engine at the dock while a step still speeds travel in the deeper bands (#418)', () => {
    const session = botAtUpgradeBayOn(2)
    shopForTheCore(session)
    expect(isTravelSetByDrill(session.state(), session.playerId)).toBe(false)
    expect(session.vehicle().levels.engine).toBeGreaterThan(0)
    expect(session.events().filter((event) => event.type === 'CommandRejected')).toEqual([])
  })

  it('holds drill power to one purchase past the planet on-curve level (#86, a level is a purchase since #552)', () => {
    expect(leadCeiling('drill_power', 2)).toBe(onCurveLevel('drill_power', 2) + 1)
    expect(leadCeiling('drill_power', 3)).toBe(onCurveLevel('drill_power', 3) + 1)
  })

  it('stops buying drill power for the core at the ceiling, however much money is left', () => {
    const session = botAtUpgradeBayOn(2)
    shopForTheCore(session)
    expect(session.vehicle().levels.drill_power).toBe(leadCeiling('drill_power', 2))
  })

  it('spends what the drill power ceiling saves on the other tracks the bay sells', () => {
    const session = botAtUpgradeBayOn(3)
    shopForTheCore(session)
    const { drill_power, boiler, cargo_hold } = session.vehicle().levels
    expect(drill_power).toBe(leadCeiling('drill_power', 3))
    expect(Math.min(boiler, cargo_hold)).toBeGreaterThan(0)
  })

  it('buys drill_tip past its on-curve level for the core once drill power is at its cap', () => {
    const session = botAtUpgradeBayOn(4)
    shopForTheCore(session)
    expect(session.vehicle().levels.drill_tip).toBeGreaterThan(onCurveStep('drill_tip', 4))
  })

  it('stops buying drill_tip for the core at its cap, two majors past on-curve', () => {
    const session = botAtUpgradeBayOn(4)
    shopForTheCore(session)
    expect(leadCeiling('drill_tip', 4)).toBe(stepOfMajor(onCurveLevel('drill_tip', 4) + 2))
    expect(session.vehicle().levels.drill_tip).toBe(leadCeiling('drill_tip', 4))
  })
})
