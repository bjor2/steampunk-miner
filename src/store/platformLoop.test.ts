import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { registeredEventOf, type RunEventName } from '../logging/eventNames'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { surfaceOreTiles } from '../systems/authority/scriptedSession'
import { UPGRADE_IDS } from '../systems/economy/economyDefinition'
import { stepPrice } from '../systems/economy/upgradePrices'
import { add, fromCanonical, sub, toCanonical, ZERO_MONEY } from '../systems/money'
import { FACING, bayPoseAt, dockedPoseAt } from '../systems/vehicle/vehiclePose'
import type { ScriptedCommand } from '../systems/fastForward'
import { dockSiteOf } from '../systems/world/dockSite'
import { planetParamsFor } from '../systems/world/planetParams'
import type { TilePoint } from '../systems/world/tileGrid'
import { readAuthorityTick, resetGameStore, useGameStore } from './gameStore'

let sink: ReturnType<typeof createMemorySink>

beforeEach(() => {
  resetGameStore()
  sink = createMemorySink()
  installRunLog(createRunLog({ runId: 'run_test', sink, secondsSinceStart: () => 0 }))
})

afterEach(() => uninstallRunLog())

const game = () => useGameStore.getState()

/** The fresh profile's planet: planet 1 of world seed 1. */
const PARAMS = planetParamsFor(1, 1)
const SITE = dockSiteOf(PARAMS)
const SIX_TRACKS = ['cargo_hold', 'boiler', 'engine', 'hull', 'drill_power', 'drill_tip']

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

/** One trip as the client would script it: drill each tile from above, then drive home. */
function mineTrip(tiles: readonly TilePoint[]): void {
  const start = readAuthorityTick() + 1
  const commands: ScriptedCommand[] = tiles.flatMap((tile, index) => [
    poseOver(tile, start + 50 * index),
    { tick: start + 50 * index + 40, type: 'drillTile', payload: { ...tile, ticks: 40 } },
  ])
  const home = start + 50 * tiles.length
  commands.push({ tick: home, type: 'reportPose', payload: { ...dockedPoseAt(SITE), ...idlePose } })
  game().fastForward(home - readAuthorityTick(), commands)
}

/** Upgrades are bought at the Upgrade bay (#37): leave the Sell bay, drive 8 m, dock there. */
function driveToUpgradeBay(): void {
  game().undock()
  const tick = readAuthorityTick() + 2
  const pose = { ...bayPoseAt(SITE, 'upgrade'), ...idlePose, driveTicks: 2 }
  game().fastForward(2, [{ tick, type: 'reportPose', payload: pose }])
  game().dock('upgrade')
}

const loggedNames = () => sink.events.map((event) => event.event as RunEventName)

/** Kernel and slice names alike: a loaded slice (the codex) logs its own lines while mining. */
const platformNames = () =>
  loggedNames().filter((name) => registeredEventOf(name)?.group === 'platform')

const sumOfLogged = (name: RunEventName, field: string) =>
  sink.events
    .filter((event) => event.event === name)
    .reduce(
      (total, event) => add(total, fromCanonical((event.data as Record<string, string>)[field])),
      ZERO_MONEY,
    )

/** What the first step of each of the six tracks costs on planet 1, read from their curves. */
function firstStepPriceOfEveryTrack() {
  return UPGRADE_IDS.map((upgradeId) => stepPrice(upgradeId, 0, 1)).reduce(add, ZERO_MONEY)
}

describe('platform loop from a fresh profile', () => {
  it('mines, sells and buys one step of each of the six tracks, logged in order', () => {
    const ore = surfaceOreTiles(30, PARAMS)
    // A fresh vehicle starts active on the pad; later trips start by leaving the dock.
    for (const trip of [ore.slice(0, 10), ore.slice(10, 20), ore.slice(20, 30)]) {
      if (game().vehicle.mode === 'docked') game().undock()
      mineTrip(trip)
      game().dock('sell')
      game().sellCargo('all')
    }
    driveToUpgradeBay()
    for (const upgradeId of SIX_TRACKS) game().buyUpgrade(upgradeId)

    // Scripted mining lines its tiles (#115), so each sale settles the trip's lining bill.
    expect(platformNames()).toEqual([
      'dock_entered',
      'resource_sold',
      'lining_settled',
      'dock_left',
      'dock_entered',
      'resource_sold',
      'lining_settled',
      'dock_left',
      'dock_entered',
      'resource_sold',
      'lining_settled',
      'dock_left',
      'dock_entered',
      ...SIX_TRACKS.map(() => 'upgrade_purchased'),
    ])
    expect(
      sink.events
        .filter((event) => event.event === 'upgrade_purchased')
        .map((event) => (event.data as { upgradeId: string }).upgradeId),
    ).toEqual(SIX_TRACKS)
    const sold = sumOfLogged('resource_sold', 'value')
    const lining = sumOfLogged('lining_settled', 'paid')
    expect(toCanonical(game().money)).toBe(
      toCanonical(sub(sub(sold, lining), firstStepPriceOfEveryTrack())),
    )
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
    expect(game().debugApplied).toBe(false)
  })

  it('logs a refused purchase as command_rejected and leaves the money alone', () => {
    game().dock('sell')
    driveToUpgradeBay()
    game().buyUpgrade('drill_tip')
    expect(sink.events.at(-1)).toMatchObject({
      event: 'command_rejected',
      data: { type: 'buyUpgrade', reason: 'money_short' },
    })
    expect(game().money).toEqual(ZERO_MONEY)
  })

  it('shows the docked vehicle and the empty core bay of a fresh run', () => {
    game().dock('sell')
    expect(game().vehicle.mode).toBe('docked')
    expect(game().platform).toEqual({
      coreBay: 0,
      coreNeeded: 63,
      visualState: 'outpost',
      refineryLook: null,
    })
  })

  it('shows the Refinery bay, idle, once the platform stands on planet 3', () => {
    game().setPlanet(3)
    expect(game().platform.refineryLook).toBe('idle')
  })
})
