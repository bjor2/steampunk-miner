import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../authority/authorityState'
import { nextCasingPrice } from '../authority/casingRules'
import { setHull } from '../authority/combat/combatFixtures'
import type { DomainEvent } from '../authority/domainEvent'
import { requiredCasingGrade } from '../economy/casingGrades'
import { cmp } from '../money'
import { undockCommand } from '../platform/platformCommands'
import { dockSiteOf } from '../world/dockSite'
import { bandOfTile } from '../world/planetGeometry'
import { planetParamsFor } from '../world/planetParams'
import { deepestHeldBand } from './botCasing'
import type { BotPlanet } from './botPilot'
import { createBotSession, type BotSession } from './botSession'
import { serviceAtDock } from './botShopping'
import { botPlanetOf } from './botTravel'
import { runTrip, waitForTow } from './botTrip'
import {
  bandOfRow,
  extendSide,
  galleryOf,
  galleryRows,
  markSideDone,
  newMineLayout,
  ORE_GALLERY_REACH,
  oreReachOf,
  widenShallowestBand,
} from './mineLayout'
import { playSliceFrom, type SliceRun } from './playSlice'
import { bestOrePlan, fullTankMeans, meansOfVehicle } from './tripEstimate'
import type { TripGoal } from './tripGoal'

/** The seed whose run #195 saw end at 5.4 minutes, docked after a rescue with no ore plan. */
const WORLD_SEED = 31415
const BAND_1: TripGoal = { kind: 'ore', band: 1 }
/** Band 1's near galleries bore out in fewer trips than this. */
const MAX_FIXTURE_TRIPS = 80
/** Twenty minutes of play after the rescue: long enough to sell and buy the next grade. */
const PLAY_ON_TICKS = 20 * 60 * 60

/** Whether no band the casing holds pays a trip with the tank the vehicle has now. */
function hasNoOrePlan(session: BotSession, planet: BotPlanet): boolean {
  const means = meansOfVehicle(session.vehicle())
  return bestOrePlan(planet.layout, means, deepestHeldBand(session)) === null
}

/** Whether none would pay with a full tank either: the held bands are bored out, not just far. */
function hasNoOrePlanOnFullTank(session: BotSession, planet: BotPlanet): boolean {
  const means = fullTankMeans(session.vehicle().levels)
  return bestOrePlan(planet.layout, means, deepestHeldBand(session)) === null
}

/** The bot mines band 1 at grade 1, selling and recharging, until no band-1 gallery near it pays. */
function boreOutBand1(session: BotSession, planet: BotPlanet): void {
  for (let trip = 0; trip < MAX_FIXTURE_TRIPS && !hasNoOrePlan(session, planet); trip++) {
    runTrip(session, planet, BAND_1)
    serviceAtDock(session)
  }
}

/** Off the pad, wrecked, towed home with the fee paid, and broke, as 31415 was after its death. */
function rescueWithEmptyWallet(session: BotSession, planet: BotPlanet): void {
  session.submit(undockCommand())
  session.submit(setHull('0'))
  waitForTow(session, planet)
  session.submit({ type: 'debug.setMoney', payload: { amount: '0' } })
}

/** The #195 dead end: band 1 bored out, casing grade 1, rescued with nothing left to spend. */
function botRescuedWithNoOrePlan(): { session: BotSession; planet: BotPlanet } {
  const start = createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: ['p1'] })
  const session = createBotSession(start, 'p1')
  const planet = botPlanetOf(session, 'never')
  boreOutBand1(session, planet)
  rescueWithEmptyWallet(session, planet)
  return { session, planet }
}

/** The fixture as it stood after the rescue, and the bot's play on from there. */
interface PlayedOn {
  deadEnd: {
    mode: string
    casingGrade: number
    hasNoOrePlan: boolean
    hasNoOrePlanOnFullTank: boolean
    isGradeUnaffordable: boolean
  }
  rescueEvents: string[]
  run: SliceRun
  maxTicks: number
  /** The first event of the play on. */
  from: number
}

let played: PlayedOn | null = null

/** One fixture and one play on, shared: the bore-out and twenty minutes of play take a while. */
function playedOn(): PlayedOn {
  played ??= playOnFromDeadEnd()
  return played
}

function playOnFromDeadEnd(): PlayedOn {
  const { session, planet } = botRescuedWithNoOrePlan()
  const deadEnd = deadEndOf(session, planet)
  const from = session.events().length
  const maxTicks = session.tick() + PLAY_ON_TICKS
  const run = playSliceFrom(session, planet, { maxTicks, gunPolicy: 'never' })
  const rescueEvents = session
    .events()
    .slice(0, from)
    .map((event) => event.type)
  return { deadEnd, rescueEvents, run, maxTicks, from }
}

function deadEndOf(session: BotSession, planet: BotPlanet): PlayedOn['deadEnd'] {
  const { wallet } = session.state().players.p1
  return {
    mode: session.vehicle().mode,
    casingGrade: session.vehicle().casingGrade,
    hasNoOrePlan: hasNoOrePlan(session, planet),
    hasNoOrePlanOnFullTank: hasNoOrePlanOnFullTank(session, planet),
    isGradeUnaffordable: cmp(wallet, nextCasingPrice(session.state(), 'p1')) < 0,
  }
}

/** Each tile broken after `from` with the casing grade held then (the #65 casing rule). */
function digsWithGrade(events: readonly DomainEvent[], from: number) {
  const params = planetParamsFor(WORLD_SEED, 1)
  let held = 1
  return events.slice(from).flatMap((event) => {
    if (event.type === 'CasingUpgraded') held = event.to
    if (event.type !== 'TileDestroyed' || event.kind === 'core') return []
    return [{ band: bandOfTile(params, event.tx, event.ty), grade: held }]
  })
}

describe('pacing bot retreat (#216)', () => {
  it('is left by the fixture docked after a rescue at grade 1, broke, with no ore plan', () => {
    const { deadEnd, rescueEvents } = playedOn()
    expect(rescueEvents).toContain('RescueTriggered')
    expect(deadEnd).toEqual({
      mode: 'docked',
      casingGrade: 1,
      hasNoOrePlan: true,
      hasNoOrePlanOnFullTank: true,
      isGradeUnaffordable: true,
    })
  })

  it('plays on from that state to the end of its budget instead of ending the run', () => {
    const { run, maxTicks } = playedOn()
    expect(run.state.tick).toBeGreaterThanOrEqual(maxTicks)
  })

  it('sells the ore of its retreat and buys the next casing grade with it', () => {
    const { run, from } = playedOn()
    expect(run.events.slice(from).map((event) => event.type)).toContain('ResourceSold')
    expect(run.state.players.p1.vehicle.casingGrade).toBeGreaterThan(1)
  })

  it('retreats only into bands its casing grade holds', () => {
    const { run, from } = playedOn()
    const digs = digsWithGrade(run.events, from)
    expect(digs.length).toBeGreaterThan(0)
    expect(digs.filter((dig) => dig.grade < requiredCasingGrade(dig.band))).toEqual([])
  })
})

describe('mine layout widening (#216)', () => {
  const params = planetParamsFor(WORLD_SEED, 1)
  const layoutWithBand1Row = () => {
    const layout = newMineLayout(params, dockSiteOf(params))
    const row = galleryRows(layout).find((candidate) => bandOfRow(layout, candidate) === 1)!
    return { layout, row }
  }

  it('reopens the sides that ended at the reach and lets the band reach one reach further', () => {
    const { layout, row } = layoutWithBand1Row()
    for (let tile = 0; tile < ORE_GALLERY_REACH; tile++) extendSide(layout, row, 'east')
    markSideDone(layout, row, 'east')
    expect(widenShallowestBand(layout, 1)).toBe(true)
    expect(galleryOf(layout, row).isEastDone).toBe(false)
    expect(oreReachOf(layout, 1)).toBe(2 * ORE_GALLERY_REACH)
  })

  it('leaves a side that ended short of the reach done, and widens nothing then', () => {
    const { layout, row } = layoutWithBand1Row()
    extendSide(layout, row, 'west')
    markSideDone(layout, row, 'west')
    expect(widenShallowestBand(layout, 1)).toBe(false)
    expect(galleryOf(layout, row).isWestDone).toBe(true)
    expect(oreReachOf(layout, 1)).toBe(ORE_GALLERY_REACH)
  })
})
