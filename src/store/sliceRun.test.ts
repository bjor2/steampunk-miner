import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, getRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { coreTiles, surfaceOreTiles } from '../systems/authority/scriptedSession'
import type { ScriptedCommand } from '../systems/fastForward'
import { isSliceEndReached } from '../systems/sliceProgress'
import { FACING, dockedPoseAt } from '../systems/vehicle/vehiclePose'
import { dockSiteOf } from '../systems/world/dockSite'
import { planetParamsFor, type PlanetParams } from '../systems/world/planetParams'
import type { TilePoint } from '../systems/world/tileGrid'
import { readAuthorityTick, resetGameStore, runEventPlaceOf, useGameStore } from './gameStore'
import { recordStartingPlanetEntered } from './planetArrivalLog'

let sink: ReturnType<typeof createMemorySink>

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

/** The fresh profile's world seed (the store's starting planet), planet 1 then planet 2. */
const PLANET_1 = planetParamsFor(1, 1)
const PLANET_2 = planetParamsFor(1, 2)
const SIX_TRACKS = ['cargo_hold', 'boiler', 'engine', 'hull', 'drill_power', 'drill_tip']

/** What the #2 acceptance sequence asks for, in order (#24 acceptance). */
const SLICE_SEQUENCE = [
  'game_started',
  'planet_entered',
  'resource_sold',
  'upgrade_purchased',
  'core_reached',
  'core_completed',
  'planet_unlocked',
  'planet_entered',
  'core_completed',
]

const idlePose = {
  vx: 0,
  vy: 0,
  driving: false,
  thrusting: false,
  drilling: false,
  thrustTicks: 0,
  driveTicks: 0,
  drillTicks: 0,
}

function poseOver(tile: TilePoint, tick: number): ScriptedCommand {
  const payload = {
    ...idlePose,
    x: tile.tx * 1000 + 500,
    y: (tile.ty + 1) * 1000 + 500,
    upx: 0,
    upy: 1024,
    facing: FACING.down,
  }
  return { tick, type: 'reportPose', payload }
}

/** One trip as the client would script it: drill each tile from above, drive home, dock. */
function mineTripAndDock(params: PlanetParams, tiles: readonly TilePoint[]): void {
  if (game().vehicle.mode === 'docked') game().undock()
  const start = readAuthorityTick() + 1
  const commands: ScriptedCommand[] = tiles.flatMap((tile, index) => [
    poseOver(tile, start + 50 * index),
    { tick: start + 50 * index + 40, type: 'drillTile', payload: { ...tile, ticks: 40 } },
  ])
  const home = start + 50 * tiles.length
  const atDock = { ...dockedPoseAt(dockSiteOf(params)), ...idlePose }
  commands.push({ tick: home, type: 'reportPose', payload: atDock })
  game().fastForward(home - readAuthorityTick(), commands)
  game().dock()
}

/** As bootstrap starts a run: `game_started`, then the starting planet's `planet_entered`. */
function startRun(): void {
  const stamp = { ...runEventPlaceOf(game()), tick: 0 }
  getRunLog().record(stamp, 'game_started', {
    gameVersion: 'test',
    buildCommit: 'test',
    platform: 'browser',
    debug: false,
  })
  recordStartingPlanetEntered()
}

/** Three surface trips sold, then one level of each of the six tracks (#2, #23). */
function earnAndBuyEveryTrack(): void {
  const ore = surfaceOreTiles(30, PLANET_1)
  for (const trip of [ore.slice(0, 10), ore.slice(10, 20), ore.slice(20, 30)]) {
    mineTripAndDock(PLANET_1, trip)
    game().sellCargo('all')
  }
  for (const upgradeId of SIX_TRACKS) game().buyUpgrade(upgradeId)
}

/**
 * The levels a core dig needs (#10: tip `3(p-1)+4` or more). Reaching them by play is the
 * pacing bot's job (#29); this scenario step sets them, logged as debug commands.
 */
function equipForCore(tipLevel: number, cargoHold: number): void {
  game().setUpgrade('drill_tip', tipLevel)
  game().setUpgrade('drill_power', 60)
  game().setUpgrade('cargo_hold', cargoHold)
}

function harvestCore(params: PlanetParams, count: number): void {
  mineTripAndDock(params, coreTiles(count, params))
}

/** Sells one trip of surface ore, enough for the travel fee (60.75 on planet 1). */
function earnTravelFee(): void {
  mineTripAndDock(PLANET_1, surfaceOreTiles(40, PLANET_1).slice(30, 40))
  game().sellCargo('all')
}

const loggedNames = () => sink.events.map((event) => event.event)

/** Whether `names` appear in `log` in this order, other lines allowed between them. */
function isSubsequence(names: readonly string[], log: readonly string[]): boolean {
  let next = 0
  for (const name of log) if (name === names[next]) next++
  return next === names.length
}

describe('slice run on both planets', () => {
  it('logs the #2 acceptance sequence and ends at the end-of-slice card', () => {
    startRun()
    earnAndBuyEveryTrack()
    equipForCore(7, 20)
    harvestCore(PLANET_1, 63)
    earnTravelFee()
    game().travel()
    equipForCore(10, 30)
    harvestCore(PLANET_2, 127)

    expect(isSubsequence(SLICE_SEQUENCE, loggedNames())).toBe(true)
    expect(
      sink.events
        .filter((event) => event.event === 'upgrade_purchased')
        .map((event) => (event.data as { upgradeId: string }).upgradeId),
    ).toEqual(SIX_TRACKS)
    expect(isSliceEndReached(game().planetTier, game().isCoreCompleted)).toBe(true)
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
  })

  it('logs core_completed once per planet, on planet 1 then on planet 2', () => {
    startRun()
    equipForCore(7, 20)
    harvestCore(PLANET_1, 63)
    game().giveMoney('100')
    game().travel()
    equipForCore(10, 30)
    harvestCore(PLANET_2, 127)
    const completions = sink.events.filter((event) => event.event === 'core_completed')
    expect(completions.map((event) => event.planet)).toEqual([1, 2])
  })

  it('plays the travel transition after the state has already changed, and skips it', () => {
    game().setCoreFragments(63)
    game().giveMoney('100')
    game().dock()
    game().travel()
    expect(game().planetTier).toBe(2)
    expect(game().travelTransition).toEqual({ fromPlanet: 1, toPlanet: 2 })
    game().finishTravelTransition()
    expect(game().travelTransition).toBeNull()
    expect(game().planetTier).toBe(2)
  })

  it('refuses travel with too few fragments and loses no state', () => {
    game().setCoreFragments(62)
    game().giveMoney('100')
    game().dock()
    const before = { ...game() }
    game().travel()
    expect(sink.events.at(-1)).toMatchObject({
      event: 'command_rejected',
      data: { type: 'travel', reason: 'core_short' },
    })
    expect(game()).toMatchObject({
      planetTier: before.planetTier,
      money: before.money,
      platform: before.platform,
      vehicle: before.vehicle,
      travelTransition: null,
    })
  })

  it('does not show the end-of-slice card for the planet-1 core', () => {
    game().setCoreFragments(63)
    expect(game().isCoreCompleted).toBe(true)
    expect(isSliceEndReached(game().planetTier, game().isCoreCompleted)).toBe(false)
  })
})
