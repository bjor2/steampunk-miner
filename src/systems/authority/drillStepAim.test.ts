import { describe, expect, it } from 'vitest'
import { AIM, aimVectorOf, type Aim } from '../vehicle/aim'
import { FACING, type Facing } from '../vehicle/vehiclePose'
import { cellDensitySum } from '../world/cellYield'
import type { TilePoint } from '../world/tileGrid'
import { EMPTY_WORLD } from '../world/worldState'
import { createScriptedSession, GROUND, PARAMS, poseAbove } from './scriptedSession'
import { readSnapshot, takeSnapshot } from './sessionSnapshot'
import { stepBoundsAt } from './stepBoundRead'

// Ticket 791: the drill aims between the four facings. A drill step and a pose report carry the
// aim in 1/64 turns off the four facings, with the facing nearest it, and the swept cut cuts along
// it: a diagonal push down-right digs a diagonal shaft. A command with no aim, every one before
// protocol 107, aims at its facing.

const DOWN_RIGHT: Aim = 56
const ROUTE_TICKS = 120
/** About the drill's pace through band 1 at drill power 12, so the body never outruns its cut. */
const ROUTE_STEP_MM = 60
const START = { x: GROUND.tx * 1000 + 500, y: (GROUND.ty + 1) * 1000 + 500 }

/** A strong drill and a full tank, reported upright above the surface tile. */
function strongSession(facing: Facing = FACING.right) {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'drill_power', level: 12 } })
  session.submit(0, { type: 'debug.setEnergy', payload: { energy: '150' } })
  session.submit(0, poseAbove(GROUND, facing))
  return session
}

/** A step every tick along `aim` from above the surface tile, at the drill's pace. */
function cutRouteAlong(aim: Aim, facing: Facing) {
  const session = strongSession(facing)
  const stepMm = Math.min(ROUTE_STEP_MM, stepBoundsAt(session.state(), 'p1').cuttingMm)
  const ahead = aimVectorOf(0, 1024, aim)
  for (let tick = 1; tick <= ROUTE_TICKS; tick++) {
    const x = START.x + Math.trunc((ahead.x * stepMm * tick) / 1024)
    const y = START.y + Math.trunc((ahead.y * stepMm * tick) / 1024)
    const payload = { x, y, facing, aim, drive: { x: 1, y: -1 } as const }
    session.submit(tick, { type: 'drillStep', payload })
  }
  return session
}

function isCut(session: ReturnType<typeof createScriptedSession>, tile: TilePoint): boolean {
  const world = session.state().world
  return cellDensitySum(world, PARAMS, tile) < cellDensitySum(EMPTY_WORLD, PARAMS, tile)
}

/** Where the route cut, as `[dx, dy]` from the surface tile, row by row from the top. */
function cutOffsetsOf(session: ReturnType<typeof createScriptedSession>): [number, number][] {
  const window = Array.from({ length: 14 * 14 }, (_, at): [number, number] => [
    (at % 14) - 3,
    2 - Math.floor(at / 14),
  ])
  return window.filter(([dx, dy]) => isCut(session, { tx: GROUND.tx + dx, ty: GROUND.ty + dy }))
}

// prettier-ignore
const DIAGONAL_GOLDEN: [number, number][] = [
  [0, 1], [1, 1], [2, 1],
  [0, 0], [1, 0], [2, 0], [3, 0],
  [1, -1], [2, -1], [3, -1], [4, -1],
  [2, -2], [3, -2], [4, -2], [5, -2],
  [3, -3], [4, -3], [5, -3], [6, -3],
  [4, -4], [5, -4], [6, -4], [7, -4],
  [5, -5], [6, -5],
]

const rejectionsOf = (session: ReturnType<typeof createScriptedSession>) =>
  session.events().filter((event) => event.type === 'CommandRejected')

describe('drill step aim (ticket 791)', () => {
  it('digs a diagonal shaft down and to the right for a push down-right', () => {
    const session = cutRouteAlong(DOWN_RIGHT, FACING.right)
    expect(rejectionsOf(session)).toEqual([])
    const diagonal = [1, 2, 3, 4].map((k) => ({ tx: GROUND.tx + k, ty: GROUND.ty - k }))
    expect(diagonal.every((tile) => isCut(session, tile))).toBe(true)
    expect(isCut(session, { tx: GROUND.tx, ty: GROUND.ty - 4 })).toBe(false)
    expect(isCut(session, { tx: GROUND.tx + 4, ty: GROUND.ty })).toBe(false)
  })

  // The terrain-stamp golden of the diagonal: the cells the route cuts, as offsets from the
  // surface tile, pinned. They lie in a band four cells across the 45 degree line, the bore's
  // width at a slant, its centre ahead of the body. Since ticket 662 the bore at 45 degrees is the
  // body's 1.27 m across its path plus the clearance, so its last stamp reaches (7, -4) too.
  it('cuts the pinned diagonal band of cells, four cells across the 45 degree line', () => {
    const cut = cutOffsetsOf(cutRouteAlong(DOWN_RIGHT, FACING.right))
    expect(cut.every(([dx, dy]) => dx + dy >= 0 && dx + dy <= 3)).toBe(true)
    expect(cut).toEqual(DIAGONAL_GOLDEN)
  })

  it('keeps the aim on the swept cursor, and a snapshot carries it across JSON', () => {
    const session = cutRouteAlong(DOWN_RIGHT, FACING.right)
    expect(session.vehicle().sweptCut?.aim).toBe(DOWN_RIGHT)
    const snapshot = JSON.parse(JSON.stringify(takeSnapshot(session.state())))
    const restored = readSnapshot(snapshot)
    expect(restored.problems).toEqual([])
    if ('state' in restored)
      expect(restored.state.players.p1.vehicle.sweptCut?.aim).toBe(DOWN_RIGHT)
  })

  it('records a reported aim on the pose, and none for a report at one of the four facings', () => {
    const session = strongSession()
    const { payload } = poseAbove(GROUND, FACING.down)
    session.submit(1, { type: 'reportPose', payload: { ...payload, facing: FACING.down, aim: 44 } })
    expect(session.vehicle().pose).toMatchObject({ facing: FACING.down, aim: 44 })
    session.submit(13, { type: 'reportPose', payload })
    expect(session.vehicle().pose).not.toHaveProperty('aim')
    expect(rejectionsOf(session)).toEqual([])
  })

  it.each([
    ['an aim at one of the four facings', FACING.down, AIM.down],
    ['an aim that is not the facing nearest it', FACING.down, DOWN_RIGHT],
    ['an aim past a whole turn', FACING.right, 64],
    ['an aim between two steps', FACING.right, 56.5],
  ])('refuses a drill step with %s', (_, facing, aim) => {
    const session = strongSession()
    const payload = { x: START.x, y: START.y - 100, facing, aim, drive: { x: 0, y: -1 } as const }
    session.submit(1, { type: 'drillStep', payload })
    expect(rejectionsOf(session)).toHaveLength(1)
    expect(session.vehicle().sweptCut).toBeUndefined()
  })
})
