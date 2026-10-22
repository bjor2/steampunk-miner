import { beforeEach, describe, expect, it } from 'vitest'
import { surfaceOreTiles } from '../systems/authority/scriptedSession'
import type { ScriptedCommand } from '../systems/fastForward'
import { sub, toCanonical, type Money } from '../systems/money'
import { lastTripIncomesOf } from '../systems/views/tripIncome'
import { NO_DRIVE } from '../systems/vehicle/driveSigns'
import { FACING, dockedPoseAt } from '../systems/vehicle/vehiclePose'
import { dockSiteOf } from '../systems/world/dockSite'
import { planetParamsFor } from '../systems/world/planetParams'
import type { TilePoint } from '../systems/world/tileGrid'
import { readAuthorityTick, resetGameStore, useGameStore } from './gameStore'

// The store follows each trip's wallet gain (ticket 719), which the shop's "{N} trips away"
// reads: a trip per hold sold, nothing kept before the first sale.

const game = () => useGameStore.getState()

beforeEach(() => resetGameStore())

const PARAMS = planetParamsFor(1, 1)
const SITE = dockSiteOf(PARAMS)

const idlePose = {
  vx: 0,
  vy: 0,
  driving: false,
  thrusting: false,
  drilling: false,
  thrustTicks: 0,
  driveTicks: 0,
  drillTicks: 0,
  drive: NO_DRIVE,
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

/** Drill each tile from above, drive home, dock at the Sell bay and sell it all. */
function sellOneTrip(tiles: readonly TilePoint[]): Money {
  if (game().vehicle.mode === 'docked') game().undock()
  const start = readAuthorityTick() + 1
  const commands: ScriptedCommand[] = tiles.flatMap((tile, index) => [
    poseOver(tile, start + 50 * index),
    { tick: start + 50 * index + 40, type: 'drillTile', payload: { ...tile, ticks: 40 } },
  ])
  const home = start + 50 * tiles.length
  commands.push({ tick: home, type: 'reportPose', payload: { ...dockedPoseAt(SITE), ...idlePose } })
  game().fastForward(home - readAuthorityTick(), commands)
  game().dock('sell')
  const before = game().money
  game().sellCargo('all')
  return sub(game().money, before)
}

const tripsOf = () => lastTripIncomesOf(game().tripLedger).map(toCanonical)

describe('trip income (ticket 719)', () => {
  it('keeps no trip before anything sold', () => {
    expect(tripsOf()).toEqual([])
  })

  it("keeps each sold trip's wallet gain, oldest first", () => {
    const ore = surfaceOreTiles(8, PARAMS)
    const first = sellOneTrip(ore.slice(0, 4))
    const second = sellOneTrip(ore.slice(4, 8))
    expect(tripsOf()).toEqual([toCanonical(first), toCanonical(second)])
  })

  it('forgets the trips with the run', () => {
    sellOneTrip(surfaceOreTiles(4, PARAMS))
    resetGameStore()
    expect(tripsOf()).toEqual([])
  })
})
