import { describe, expect, it } from 'vitest'
import { NO_DRIVE } from '../vehicle/driveSigns'
import { FACING, noseTileOf, type VehiclePose } from '../vehicle/vehiclePose'
import { surfaceRowOfColumn } from '../world/tileGrid'
import { vehicleOf, type AuthorityState } from './authorityState'
import { DRILL_CELLS_PER_TICK, guaranteedShareOf, perCellShareAt } from './cutShare'
import { drillAlongStep } from './drillStepCut'
import { createScriptedSession, PARAMS, poseAbove } from './scriptedSession'
import { sweptStampAheadMmAt } from './stepBoundRead'

// The per-cell budget's co-op share (ticket 335, TD scope b on #316): round-robin per player in
// player-id order, each guaranteed floor(budget / players), unused share passed on in id order.

const PLAYERS = ['p1', 'p2', 'p3', 'p4']
/** Each player's own band-1 column east of the dock, the body 3 tiles above its surface. */
const COLUMNS = [20, 40, 60, 80]
/** 4 m a tick (240 m/s): a sweep of about 12 cells, over a quarter of the budget. */
const STRIDE_MM = 4_000

function startOf(column: number) {
  return { x: column * 1000 + 500, y: (surfaceRowOfColumn(column, PARAMS.radiusTiles) + 3) * 1000 }
}

/** `players` each with a full tank, reported over its own column facing down. */
function playersFacingDown(players: readonly string[] = PLAYERS): AuthorityState {
  const session = createScriptedSession(players)
  players.forEach((playerId, index) => {
    session.submit(0, { type: 'debug.setEnergy', payload: { energy: '100000' } }, playerId)
    const { payload } = poseAbove({ tx: 0, ty: 0 }, FACING.down)
    session.submit(
      0,
      { type: 'reportPose', payload: { ...payload, ...startOf(COLUMNS[index]) } },
      playerId,
    )
  })
  return session.state()
}

/** One tick: each player in id order steps `stride` further down; each one's share before it. */
function stepEveryPlayer(start: AuthorityState, tick: number, stride: number) {
  let state = { ...start, tick }
  const shares: number[] = []
  Object.keys(start.players).forEach((playerId, index) => {
    const reported = vehicleOf(state, playerId).pose as VehiclePose
    const { x, y } = startOf(COLUMNS[index])
    const pose = { ...reported, x, y: y - stride * (tick - 1) }
    shares.push(perCellShareAt(state, playerId))
    const step = { pose, drive: NO_DRIVE, isLifting: false }
    state = drillAlongStep(state, PARAMS, playerId, noseTileOf(pose), step).state
  })
  return { state, shares }
}

describe('per-cell cut share (ticket 335)', () => {
  it('guarantees each of n players floor(budget / n), the first also the remainder', () => {
    expect([0, 1, 2, 3].map((index) => guaranteedShareOf(32, 4, index))).toEqual([8, 8, 8, 8])
    expect([0, 1, 2].map((index) => guaranteedShareOf(32, 3, index))).toEqual([12, 10, 10])
    expect(guaranteedShareOf(DRILL_CELLS_PER_TICK, 1, 0)).toBe(32)
  })

  it('gives each of 4 co-op players at the budget a quarter or more, and its whole sweep', () => {
    const first = stepEveryPlayer(playersFacingDown(), 1, STRIDE_MM)
    const { state, shares } = stepEveryPlayer(first.state, 2, STRIDE_MM)
    expect(Math.min(...shares)).toBeGreaterThanOrEqual(DRILL_CELLS_PER_TICK / 4)
    PLAYERS.forEach((playerId, index) => {
      const aheadMm = sweptStampAheadMmAt(state, playerId)
      const stampY = startOf(COLUMNS[index]).y - STRIDE_MM - aheadMm
      expect(vehicleOf(state, playerId).sweptCut?.yMm).toBe(stampY)
    })
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
