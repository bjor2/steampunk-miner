import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemorySink } from '../logging/eventSink'
import { RUN_EVENT_REGISTRY, type RunEventName } from '../logging/eventNames'
import { createRunLog, installRunLog, uninstallRunLog } from '../logging/runLog'
import { runEventProblems } from '../logging/runEventSchema'
import { surfaceOreTiles } from '../systems/authority/scriptedSession'
import { add, fromCanonical, sub, toCanonical, ZERO_MONEY } from '../systems/money'
import { FACING, dockedPoseAt } from '../systems/vehicle/vehiclePose'
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

const loggedNames = () => sink.events.map((event) => event.event as RunEventName)

const platformNames = () =>
  loggedNames().filter((name) => RUN_EVENT_REGISTRY[name].group === 'platform')

const soldValues = () =>
  sink.events
    .filter((event) => event.event === 'resource_sold')
    .reduce(
      (total, event) => add(total, fromCanonical((event.data as { value: string }).value)),
      ZERO_MONEY,
    )

describe('platform loop from a fresh profile', () => {
  it('mines, sells and buys one level of each of the six tracks, logged in order', () => {
    const ore = surfaceOreTiles(30, PARAMS)
    // A fresh vehicle starts active on the pad; later trips start by leaving the dock.
    for (const trip of [ore.slice(0, 10), ore.slice(10, 20), ore.slice(20, 30)]) {
      if (game().vehicle.mode === 'docked') game().undock()
      mineTrip(trip)
      game().dock()
      game().sellCargo('all')
    }
    for (const upgradeId of SIX_TRACKS) game().buyUpgrade(upgradeId)

    expect(platformNames()).toEqual([
      'dock_entered',
      'resource_sold',
      'dock_left',
      'dock_entered',
      'resource_sold',
      'dock_left',
      'dock_entered',
      'resource_sold',
      ...SIX_TRACKS.map(() => 'upgrade_purchased'),
    ])
    expect(
      sink.events
        .filter((event) => event.event === 'upgrade_purchased')
        .map((event) => (event.data as { upgradeId: string }).upgradeId),
    ).toEqual(SIX_TRACKS)
    expect(toCanonical(game().money)).toBe(toCanonical(sub(soldValues(), fromCanonical('252'))))
    expect(sink.events.flatMap(runEventProblems)).toEqual([])
    expect(game().debugApplied).toBe(false)
  })

  it('logs a refused purchase as command_rejected and leaves the money alone', () => {
    game().dock()
    game().buyUpgrade('drill_tip')
    expect(sink.events.at(-1)).toMatchObject({
      event: 'command_rejected',
      data: { type: 'buyUpgrade', reason: 'money_short' },
    })
    expect(game().money).toEqual(ZERO_MONEY)
  })

  it('shows the docked vehicle and the empty core bay of a fresh run', () => {
    game().dock()
    expect(game().vehicle.mode).toBe('docked')
    expect(game().platform).toEqual({ coreBay: 0, coreNeeded: 63, visualState: 'outpost' })
  })
})
