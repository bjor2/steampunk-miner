import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { isTravelSetByDrill } from '../authority/travelSpeed'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { stepOfMajor } from '../economy/upgradeSteps'
import { onCurveLevel, onCurveStep, onCurveSteps } from '../economy/vehicleStats'
import { leadCeiling } from './botCoreRule'
import { buyUpgrades } from './botShopping'
import { createBotSession, type BotSession } from './botSession'
import { paramsOfSession } from './botWorld'
import { newMineLayout } from './mineLayout'

const WORLD_SEED = 83921
/** More money than any planet's tracks can absorb. */
const DEEP_WALLET = '1e15'
/**
 * A planet whose core the forced rule still finds slow one tip pip short of the tip's cap (#86),
 * so it buys the tip to that cap. Since #552 one drill power purchase past on-curve digs the core
 * within 2.5 seconds (150 ticks) a tile through planet 9 (148 ticks; 153 on planet 10), so the tip
 * is not forced before planet 10; one pip short of the tip's cap the core takes 134 ticks a tile on
 * planet 30 and 176 on planet 40.
 */
const TIP_CAP_PLANET = 40
/** More money than planet 40's tracks can absorb. */
const TIP_CAP_WALLET = '1e40'
/**
 * The first planet where the one-purchase lead's k times cut passes the on-curve engine in band 1
 * (25.98 m/s) but not in the hardest band (10.50 against 11.01). On planets 1 to 6 the drill sets
 * travel in every band at the lead cap since #552, so the engine card reads maxed there (#418).
 */
const ENGINE_STILL_SPEEDS_PLANET = 7

/** The bot docked at the Upgrade bay of planet `planetIndex`, with money to spare. */
function botAtUpgradeBayOn(planetIndex: number, wallet = DEEP_WALLET): BotSession {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  session.submit({ type: 'debug.setPlanet', payload: { planetIndex } })
  session.submit({ type: 'debug.setMoney', payload: { amount: wallet } })
  session.submit({ type: 'debug.teleportToDock', payload: { bay: 'upgrade' } })
  return session
}

/** The bot docked at planet `planetIndex`'s Upgrade bay with every track at its on-curve step. */
function botArrivedOnCurveAt(planetIndex: number, wallet = DEEP_WALLET): BotSession {
  const session = botAtUpgradeBayOn(planetIndex, wallet)
  for (const [upgradeId, level] of Object.entries(onCurveSteps(planetIndex))) {
    session.submit({ type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  return session
}

/**
 * Steps that cut every band at the tile floor, so k times the cut passes the engine everywhere.
 * Drill power's purchase 106 is the first at or past the old stored 2000 since #552.
 */
function withDrillSettingTravelEverywhere(session: BotSession): void {
  session.submit({ type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 106 } })
  session.submit({ type: 'debug.setUpgrade', payload: { upgradeId: 'drill_tip', level: 600 } })
}

/** One shop for the core on planet 40, arrived on curve: both tip tests read it. */
let tipCapShop: BotSession | null = null

function shoppedForTheCoreAtTipCapPlanet(): BotSession {
  if (tipCapShop !== null) return tipCapShop
  tipCapShop = botArrivedOnCurveAt(TIP_CAP_PLANET, TIP_CAP_WALLET)
  shopForTheCore(tipCapShop)
  return tipCapShop
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

  // #418: the lead-capped planet 7 drill passes the on-curve engine in band 1 but not in the
  // hardest band (planet 2 before #552's per-purchase drill).
  it('buys the engine at the dock while a step still speeds travel in the deeper bands (#418)', () => {
    const session = botArrivedOnCurveAt(ENGINE_STILL_SPEEDS_PLANET)
    shopForTheCore(session)
    expect(isTravelSetByDrill(session.state(), session.playerId)).toBe(false)
    expect(session.vehicle().levels.engine).toBeGreaterThan(
      onCurveStep('engine', ENGINE_STILL_SPEEDS_PLANET),
    )
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
    const { drill_power, drill_tip } = shoppedForTheCoreAtTipCapPlanet().vehicle().levels
    expect(drill_power).toBe(leadCeiling('drill_power', TIP_CAP_PLANET))
    expect(drill_tip).toBeGreaterThan(onCurveStep('drill_tip', TIP_CAP_PLANET))
  })

  it('stops buying drill_tip for the core at its cap, two majors past on-curve', () => {
    const session = shoppedForTheCoreAtTipCapPlanet()
    expect(leadCeiling('drill_tip', TIP_CAP_PLANET)).toBe(
      stepOfMajor(onCurveLevel('drill_tip', TIP_CAP_PLANET) + 2),
    )
    expect(session.vehicle().levels.drill_tip).toBe(leadCeiling('drill_tip', TIP_CAP_PLANET))
  })
})
