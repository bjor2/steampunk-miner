import { describe, expect, it } from 'vitest'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING, noseTileOf, type VehiclePose } from '../vehicle/vehiclePose'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { vehicleOf, type AuthorityState } from './authorityState'
import { DRILL_CELLS_PER_TICK, guaranteedShareOf, perCellShareAt } from './cutShare'
import { drillAlongStep } from './drillStepCut'
import { createScriptedSession, PARAMS, poseAbove } from './scriptedSession'

// The per-cell budget's co-op share (ticket 335, TD scope b on #316): round-robin per player in
// player-id order, each guaranteed floor(budget / players), unused share passed on in id order.

const PLAYERS = ['p1', 'p2', 'p3', 'p4']
/** Each player's own band-1 column east of the dock, the body 3 tiles above its surface. */
const COLUMN_OF: Record<string, number> = { p1: 20, p2: 40, p3: 60, p4: 80 }
/** 4 m a tick (240 m/s): a sweep of about 12 cells, over a quarter of the budget. */
const STRIDE_MM = 4_000

function startOf(column: number) {
  return { x: column * 1000 + 500, y: (surfaceRowOfColumn(column, PARAMS.radiusTiles) + 3) * 1000 }
}

/** `players` each with a full tank, reported over its own column facing down. */
function playersFacingDown(players: readonly string[] = PLAYERS): AuthorityState {
  const session = createScriptedSession(players)
  players.forEach((playerId) => {
    session.submit(0, { type: 'debug.setEnergy', payload: { energy: '100000' } }, playerId)
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
    session.submit(
      0,
      { type: 'reportPose', payload: { ...payload, ...startOf(COLUMN_OF[playerId]) } },
      playerId,
    )
  })
  return session.state()
}

/** One tick: each player in id order steps `stride` further down; each one's share before it. */
function stepEveryPlayer(start: AuthorityState, tick: number, stride: number) {
  let state = { ...start, tick }
  const shares: number[] = []
  Object.keys(start.players).forEach((playerId) => {
    const reported = vehicleOf(state, playerId).pose as VehiclePose
    const { x, y } = startOf(COLUMN_OF[playerId])
    const pose = { ...reported, x, y: y - stride * (tick - 1) }
    shares.push(perCellShareAt(state, playerId))
    const step = { pose, drive: NO_DRIVE, isLifting: false }
    state = drillAlongStep(state, PARAMS, playerId, noseTileOf(pose), step).state
  })
  return { state, shares }
}

/** Where a player's cut reached and the work it carries. */
function reachOf(state: AuthorityState, playerId: string) {
  const cursor = vehicleOf(state, playerId).sweptCut
  return { xMm: cursor?.xMm, yMm: cursor?.yMm ?? 0, carrySubSteps: cursor?.carrySubSteps }
}

/** `players` cut down their columns for 100 ticks, `STRIDE_MM` a tick; the last tick's shares. */
function cutTicks(players: readonly string[]) {
  let ticked = stepEveryPlayer(playersFacingDown(players), 1, STRIDE_MM)
  for (let tick = 2; tick <= 100; tick++) ticked = stepEveryPlayer(ticked.state, tick, STRIDE_MM)
  return ticked
}

describe('per-cell cut share (ticket 335)', () => {
  it('guarantees each of n players floor(budget / n), the first also the remainder', () => {
    expect([0, 1, 2, 3].map((index) => guaranteedShareOf(32, 4, index))).toEqual([8, 8, 8, 8])
    expect([0, 1, 2].map((index) => guaranteedShareOf(32, 3, index))).toEqual([12, 10, 10])
    expect(guaranteedShareOf(DRILL_CELLS_PER_TICK, 1, 0)).toBe(32)
  })

  // The share picks how a tick is cut, never how far (ticket 399 amending 335): each player's cut
  // reaches where its own work does, as it would alone.
  it('gives each of 4 co-op players at the budget a quarter or more, and its reach alone', () => {
    const coop = cutTicks(PLAYERS)
    expect(Math.min(...coop.shares)).toBeGreaterThanOrEqual(DRILL_CELLS_PER_TICK / 4)
    for (const playerId of PLAYERS) {
      const reach = reachOf(coop.state, playerId)
      expect(reach).toEqual(reachOf(cutTicks([playerId]).state, playerId))
      expect(reach.yMm).toBeLessThan(startOf(COLUMN_OF[playerId]).y - 2_000)
    }
  })

  it('passes what a player left of its share to the next player in id order that tick', () => {
    const first = stepEveryPlayer(playersFacingDown(['p1', 'p2']), 1, 0)
    const passed = vehicleOf(first.state, 'p1').sweptCut?.cutSharePassed ?? 0
    expect(passed).toBeGreaterThan(0)
    expect(perCellShareAt({ ...first.state, tick: 2 }, 'p2')).toBe(16)
    const second = stepEveryPlayer(first.state, 2, 0)
    const passedAgain = vehicleOf(second.state, 'p1').sweptCut?.cutSharePassed ?? 0
    expect(second.shares).toEqual([16, 16 + passedAgain])
    expect(second.shares[1]).toBeGreaterThan(16)
  })
})
