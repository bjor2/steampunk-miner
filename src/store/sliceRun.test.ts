import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { createRunLog, getRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { coreTiles, surfaceOreTiles } from '../systems/authority/scriptedSession'
import type { ScriptedCommand } from '../systems/fastForward'
import { isSliceEndReached } from '../systems/sliceProgress'
import { FACING, bayPoseAt, dockedPoseAt } from '../systems/vehicle/vehiclePose'
import { dockSiteOf } from '../systems/world/dockSite'
import { planetParamsFor, type PlanetParams } from '../systems/world/planetParams'
import type { TilePoint } from '../systems/world/tileGrid'
import type { FeedbackCue } from '../systems/feedback/feedbackCues'
import {
  createScreenEffects,
  kickScreen,
  stepScreenEffects,
} from '../systems/feedback/screenEffects'
import type { CameraMode } from '../systems/render/cameraTurn'
import { listenForFeedback } from './feedbackBroadcast'
import {
  readAuthorityTick,
  resetGameStore,
  runEventPlaceOf,
  takeSessionSnapshot,
  useGameStore,
} from './gameStore'
import { recordStartingPlanetEntered } from './planetArrivalLog'
import { stepOfMajor } from '../systems/economy/upgradeSteps'

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
  game().dock('sell')
}

/** Upgrades are bought at the Upgrade bay (#37): leave the Sell bay, drive 8 m, dock there. */
function driveToUpgradeBay(params: PlanetParams): void {
  game().undock()
  const tick = readAuthorityTick() + 2
  const pose = { ...bayPoseAt(dockSiteOf(params), 'upgrade'), ...idlePose, driveTicks: 2 }
  game().fastForward(2, [{ tick, type: 'reportPose', payload: pose }])
  game().dock('upgrade')
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
  driveToUpgradeBay(PLANET_1)
  for (const upgradeId of SIX_TRACKS) game().buyUpgrade(upgradeId)
}

/**
 * The levels a core dig needs (#10: tip `3(p-1)+4` or more). Reaching them by play is the
 * pacing bot's job (#29); this scenario step sets them, logged as debug commands.
 */
function equipForCore(tipLevel: number, cargoHold: number): void {
  game().setUpgrade('drill_tip', stepOfMajor(tipLevel))
  game().setUpgrade('drill_power', stepOfMajor(60))
  game().setUpgrade('cargo_hold', stepOfMajor(cargoHold))
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
    game().dock('sell')
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
    game().dock('sell')
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

describe('presentation settings and the run', () => {
  const COMBINATIONS = (['rotating', 'fixed'] as CameraMode[]).flatMap((cameraMode) =>
    [true, false].flatMap((shake) =>
      [true, false].map((flashes) => ({ cameraMode, shake, flashes })),
    ),
  )

  /** A trip, a sale and an upgrade with the screen effects listening, as the scene would. */
  function playWithSettings(settings: (typeof COMBINATIONS)[number]) {
    resetGameStore()
    game().setCameraMode(settings.cameraMode)
    game().setPreference('shake', settings.shake)
    game().setPreference('flashes', settings.flashes)
    const effects = createScreenEffects()
    const heard: FeedbackCue['kind'][] = []
    const stopListening = listenForFeedback((cue) => {
      heard.push(cue.kind)
      kickScreen(effects, cue, game().prefs)
      stepScreenEffects(effects, 1 / 60, game().prefs)
    })
    mineTripAndDock(PLANET_1, surfaceOreTiles(10, PLANET_1))
    game().sellCargo('all')
    driveToUpgradeBay(PLANET_1)
    game().buyUpgrade('cargo_hold')
    stopListening()
    return { digest: takeSessionSnapshot().digest, heard }
  }

  it('reaches the same state digest with every camera, shake and flash setting', () => {
    const runs = COMBINATIONS.map(playWithSettings)
    expect(new Set(runs.map((run) => run.digest)).size).toBe(1)
    runs.forEach((run) =>
      expect(run.heard).toEqual(expect.arrayContaining(['pickup', 'dockClank', 'upgradeClank'])),
    )
  })
})

describe('zoom and the run (#39 acceptance 3)', () => {
  /** Two trips, a sale and an upgrade; `zoomBetweenSteps` runs before and after every step. */
  function playTwoTrips(zoomBetweenSteps: () => void): string {
    resetGameStore()
    const steps = [
      () => mineTripAndDock(PLANET_1, surfaceOreTiles(6, PLANET_1)),
      () => game().sellCargo('all'),
      () => mineTripAndDock(PLANET_1, surfaceOreTiles(12, PLANET_1).slice(6)),
      () => game().buyUpgrade('cargo_hold'),
    ]
    zoomBetweenSteps()
    steps.forEach((step) => {
      step()
      zoomBetweenSteps()
    })
    return takeSessionSnapshot().digest
  }

  function zoomAround(): void {
    game().zoom('out')
    game().zoom('out')
    game().zoom('in')
    game().setViewShortAxis(20)
    game().zoom('reset')
    game().setViewShortAxis(8)
  }

  it('reaches the same state digest when the zoom changes repeatedly as when it never does', () => {
    const zoomed = playTwoTrips(zoomAround)
    expect(game().prefs.viewShortAxisMetres).toBe(8)
    expect(zoomed).toBe(playTwoTrips(() => {}))
  })
})
