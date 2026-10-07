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
/** Five minutes after a tow: long enough to mine and sell from the quarter tank it leaves. */
const TOW_PLAY_ON_TICKS = 5 * 60 * 60
/** Two energy units: far below the quarter tank a tow leaves (#8). */
const DRAINED_ENERGY_UNITS = '2'

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

interface DeadEnd {
  session: BotSession
  planet: BotPlanet
}

let deadEnd: DeadEnd | null = null

/** One bore-out, shared: it takes a while, and each case plays on from a branch of it. */
function rescuedDeadEnd(): DeadEnd {
  deadEnd ??= botRescuedWithNoOrePlan()
  return deadEnd
}

/** A session of its own from the dead end's state, with the mine remembered as it was. */
function branchOfDeadEnd(): DeadEnd {
  const { session, planet } = rescuedDeadEnd()
  return { session: createBotSession(session.state(), 'p1'), planet: structuredClone(planet) }
}

/** The same dead end with the tank run down below what a tow leaves. */
function drainedBranchOfDeadEnd(): DeadEnd {
  const branch = branchOfDeadEnd()
  branch.session.submit({ type: 'debug.setEnergy', payload: { energy: DRAINED_ENERGY_UNITS } })
  return branch
}

interface PlayedOn {
  run: SliceRun
  maxTicks: number
}

function playOn({ session, planet }: DeadEnd, ticks: number): PlayedOn {
  const maxTicks = session.tick() + ticks
  return { run: playSliceFrom(session, planet, { maxTicks, gunPolicy: 'never' }), maxTicks }
}

let retreat: PlayedOn | null = null
let tow: PlayedOn | null = null

function retreatPlayedOn(): PlayedOn {
  retreat ??= playOn(branchOfDeadEnd(), PLAY_ON_TICKS)
  return retreat
}

function towPlayedOn(): PlayedOn {
  tow ??= playOn(drainedBranchOfDeadEnd(), TOW_PLAY_ON_TICKS)
  return tow
}

function deadEndOf({ session, planet }: DeadEnd) {
  const { wallet } = session.state().players.p1
  return {
    mode: session.vehicle().mode,
    casingGrade: session.vehicle().casingGrade,
    hasNoOrePlan: hasNoOrePlan(session, planet),
    hasNoOrePlanOnFullTank: hasNoOrePlanOnFullTank(session, planet),
    isGradeUnaffordable: cmp(wallet, nextCasingPrice(session.state(), 'p1')) < 0,
  }
}

const typesOf = (events: readonly DomainEvent[]) => events.map((event) => event.type)

/** Each tile broken with the casing grade held then (the #65 casing rule), from grade 1. */
function digsWithGrade(events: readonly DomainEvent[]) {
  const params = planetParamsFor(WORLD_SEED, 1)
  let held = 1
  return events.flatMap((event) => {
    if (event.type === 'CasingUpgraded') held = event.to
    if (event.type !== 'TileDestroyed' || event.kind === 'core') return []
    return [{ band: bandOfTile(params, event.tx, event.ty), grade: held }]
  })
}

describe('pacing bot retreat (#216)', () => {
  it('is left by the fixture docked after a rescue at grade 1, broke, with no ore plan', () => {
    expect(typesOf(rescuedDeadEnd().session.events())).toContain('RescueTriggered')
    expect(deadEndOf(rescuedDeadEnd())).toEqual({
      mode: 'docked',
      casingGrade: 1,
      hasNoOrePlan: true,
      hasNoOrePlanOnFullTank: true,
      isGradeUnaffordable: true,
    })
  })

  it('plays on from that state to the end of its budget instead of ending the run', () => {
    const { run, maxTicks } = retreatPlayedOn()
    expect(run.state.tick).toBeGreaterThanOrEqual(maxTicks)
    expect(typesOf(run.events)).not.toContain('CommandRejected')
  })

  it('sells the ore of its retreat and buys the next casing grade with it', () => {
    const { run } = retreatPlayedOn()
    expect(typesOf(run.events)).toContain('ResourceSold')
    expect(run.state.players.p1.vehicle.casingGrade).toBeGreaterThan(1)
  })

  it('retreats only into bands its casing grade holds', () => {
    const digs = digsWithGrade(retreatPlayedOn().run.events)
    expect(digs.length).toBeGreaterThan(0)
    expect(digs.filter((dig) => dig.grade < requiredCasingGrade(dig.band))).toEqual([])
  })
})

describe('pacing bot tow for a broke bot (#216, #8 soft-lock rule)', () => {
  it('strands itself off the pad for the tow before any trip when its tank is below the tow floor', () => {
    const types = typesOf(towPlayedOn().run.events)
    const stranded = types.indexOf('EnergyDepleted')
    expect(stranded).toBeGreaterThanOrEqual(0)
    expect(types.slice(0, stranded)).not.toContain('TileDestroyed')
    expect(types.slice(stranded)).toContain('RescueTriggered')
  })

  it('plays on after the tow to the end of its budget, sending only commands the authority accepts', () => {
    const { run, maxTicks } = towPlayedOn()
    expect(run.state.tick).toBeGreaterThanOrEqual(maxTicks)
    expect(typesOf(run.events)).not.toContain('CommandRejected')
    expect(typesOf(run.events)).toContain('ResourceSold')
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
