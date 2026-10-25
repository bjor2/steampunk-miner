import { describe, expect, it } from 'vitest'
import { PACING_TARGETS } from '../../constants/pacingTargets'
import { createAuthorityState } from '../authority/authorityState'
import { dockSiteOfPlanet } from '../authority/planetOfState'
import { UPGRADE_IDS } from '../economy/economyDefinition'
import { stepOfMajor } from '../economy/upgradeSteps'
import {
  onCurveLevel,
  onCurveStep,
  onCurveSteps,
  type UpgradeLevels,
} from '../economy/vehicleStats'
import { bandDigTicks } from '../vehicle/bandDig'
import { leadCeiling } from './botCoreRule'
import { buyUpgrades } from './botShopping'
import { createBotSession, type BotSession } from './botSession'
import { paramsOfSession } from './botWorld'
import { bandOfRow, galleryRows, markSideDone, newMineLayout, type MineLayout } from './mineLayout'

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
 * #418's planet, where the one-purchase lead's drill once set travel in band 1 but not in the
 * hardest band. Since ticket 723 the drill sets travel nowhere, so every engine step speeds it.
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
 * Steps that cut every band at the tile floor, far past the engine everywhere: the drill that set
 * travel everywhere under travel parity (retired by ticket 723). Drill power's purchase 106 is the
 * first at or past the old stored 2000 since #552.
 */
function withDrillFarPastTheEngine(session: BotSession): void {
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

/**
 * Shops with the core as the goal, so the forced core rule leads; with the planet's arrival levels
 * the down-cut drill rule (ticket 763) comes before the on-curve tip.
 */
function shopForTheCore(
  session: BotSession,
  layout = freshMineOf(session),
  arrivalLevels?: UpgradeLevels,
): void {
  buyUpgrades(session, {
    layout,
    isCoreTheGoal: true,
    gunPolicy: 'never',
    hasMetBlastTile: false,
    restockSize: 1,
    chainPolicy: 'click',
    arrivalLevels,
  })
}

function freshMineOf(session: BotSession): MineLayout {
  return newMineLayout(paramsOfSession(session.state()), dockSiteOfPlanet(session.state().planet)!)
}

/**
 * A mine whose band 1 galleries are bored out, so its trips run to the deeper bands. On a fresh
 * mine since the surface layer (ticket 625) the soft band 1 galleries pay best, and the bot rightly
 * spends on the hold and the boiler there, where travel is short.
 */
function mineWithBandOneBoredOut(session: BotSession): MineLayout {
  const layout = freshMineOf(session)
  for (const row of galleryRows(layout).filter((row) => bandOfRow(layout, row) === 1)) {
    markSideDone(layout, row, 'east')
    markSideDone(layout, row, 'west')
  }
  return layout
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

  // Ticket 553: no max level; since ticket 723 the drill never sets travel, however strong.
  it('sends no track buy the Upgrade bay refuses with a drill far past the engine', () => {
    const session = botAtUpgradeBayOn(2)
    withDrillFarPastTheEngine(session)
    shopForTheCore(session)
    expect(session.events().filter((event) => event.type === 'CommandRejected')).toEqual([])
  })

  // #418: the lead-capped planet 7 drill once set travel in band 1; since ticket 723 every engine
  // step speeds travel everywhere.
  it('buys the engine at the dock past its on-curve step (#418)', () => {
    const session = botArrivedOnCurveAt(ENGINE_STILL_SPEEDS_PLANET)
    shopForTheCore(session, mineWithBandOneBoredOut(session))
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

/**
 * Planet 3 as seed 27182 reached it, at the dock of its one big sale (ticket 763): planet 1's
 * drill power, planet 2's tip, and 30.5k, of which the tip's 30 steps to on-curve cost about 27k.
 */
const PLANET_THREE_ARRIVAL = {
  drill_power: 12,
  drill_tip: 100,
  hull: 80,
  engine: 8,
  cargo_hold: 31,
  boiler: 22,
}
const PLANET_THREE_BIG_SALE = '30531'

function arrivedOnPlanetThreeAtTheBigSale(): BotSession {
  const session = botAtUpgradeBayOn(3, PLANET_THREE_BIG_SALE)
  for (const [upgradeId, level] of Object.entries(PLANET_THREE_ARRIVAL)) {
    session.submit({ type: 'debug.setUpgrade', payload: { upgradeId, level } })
  }
  return session
}

describe('bot: the down-cut drill rule at the Upgrade bay (ticket 763)', () => {
  it('buys drill power ahead of the on-curve tip until band 5 down is cut in 0.7x its arrival time', () => {
    const session = arrivedOnPlanetThreeAtTheBigSale()
    const arrival = session.vehicle().levels
    shopForTheCore(session, freshMineOf(session), arrival)
    const departure = session.vehicle().levels
    expect(departure.drill_power).toBeGreaterThan(arrival.drill_power)
    expect(bandDigTicks(3, departure)! / bandDigTicks(3, arrival)!).toBeLessThanOrEqual(
      PACING_TARGETS.sawtoothDepartureRatioMax,
    )
  })

  it('spends what the drill leaves on the tip, toward its on-curve level', () => {
    const session = arrivedOnPlanetThreeAtTheBigSale()
    const arrival = session.vehicle().levels
    shopForTheCore(session, freshMineOf(session), arrival)
    expect(session.vehicle().levels.drill_tip).toBeGreaterThan(arrival.drill_tip)
    expect(session.events().filter((event) => event.type === 'CommandRejected')).toEqual([])
  })
})

/** Shops for ore on planet 1's mine with band 1 bored out, so its next trip wants band 2. */
function shopForBandTwo(session: BotSession, hasRetreated: boolean) {
  return buyUpgrades(session, {
    layout: mineWithBandOneBoredOut(session),
    isCoreTheGoal: false,
    gunPolicy: 'never',
    hasMetBlastTile: false,
    restockSize: 1,
    chainPolicy: 'click',
    hasRetreated,
  })
}

// #894: grade 2 costs 240, so the #216 dead end's ore must not go on tracks that mine nothing new.
describe('bot: saving for casing after a retreat (#894)', () => {
  it('buys no track while it saves for the grade its next trip wants', () => {
    const session = botAtUpgradeBayOn(1, '200')
    expect(shopForBandTwo(session, true)).toEqual([])
    expect(session.vehicle().casingGrade).toBe(1)
  })

  it('buys the grade first once the savings pay for it', () => {
    const session = botAtUpgradeBayOn(1, '300')
    const [first] = shopForBandTwo(session, true)
    expect(first).toMatchObject({ purchaseId: 'buyCasingGrade' })
    expect(session.vehicle().casingGrade).toBe(2)
  })

  it('still buys tracks meanwhile on a planet it never retreated on', () => {
    const session = botAtUpgradeBayOn(1, '200')
    expect(shopForBandTwo(session, false).length).toBeGreaterThan(0)
    expect(session.vehicle().casingGrade).toBe(1)
  })
})
