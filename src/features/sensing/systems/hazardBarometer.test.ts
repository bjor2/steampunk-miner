import { describe, expect, it } from 'vitest'
import { createAuthorityState } from '../../../systems/authority/authorityState'
import {
  gnawCasingCommand,
  lineCasingCommand,
} from '../../../systems/authority/casingDebugCommands'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import { planetParamsOf } from '../../../systems/authority/planetOfState'
import {
  continueScriptedSession,
  createScriptedSession,
  GROUND,
  poseAbove,
  WORLD_SEED,
  type ScriptedSession,
} from '../../../systems/authority/scriptedSession'
import { FACING, type Facing } from '../../../systems/vehicle/vehiclePose'
import type { PlanetParams } from '../../../systems/world/planetParams'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import { surfaceRowOfColumn, type TilePoint } from '../../../systems/world/tileGrid'
import { isLavaCell } from '../../../systems/world/worldCell'
import { cellAt, EMPTY_WORLD } from '../../../systems/world/worldState'
import { barometerWarningsOf } from './hazardBarometer'

// The hazard barometer (#162 Sensing row, 4.4): lava pockets and weak lining in the cells ahead
// of the drill, out to its lookahead, nearest first.

const MM = 1000
const LOOKAHEAD = 4
/** The drill's bore radius, the ring the lining is laid round (casingBreach.test.ts). */
const BORE_MM = 950

/** A pose report with the miner upright (local up = +y), centred on `tile`, facing `facing`. */
function standAt(session: ScriptedSession, tick: number, tile: TilePoint, facing: Facing) {
  const { payload } = poseAbove(GROUND, facing)
  const centre = { x: tile.tx * MM + MM / 2, y: tile.ty * MM + MM / 2 }
  session.submit(tick, {
    type: 'reportPose',
    payload: { ...payload, ...centre, upx: 0, upy: 1024, vx: 0, vy: 0 },
  })
}

function heatPlanetEight() {
  const session = continueScriptedSession(
    createAuthorityState({ planetIndex: 8, planetSeed: WORLD_SEED, playerIds: ['p1'] }),
  )
  return { session, params: planetParamsOf(session.state().planet) as PlanetParams }
}

/** The first lava tile down column 0 of planet 8 whose two tiles to the left are not lava. */
function lavaTileOf(params: PlanetParams): TilePoint {
  for (let ty = surfaceRowOfColumn(0, params.radiusTiles); ty > params.coreRadiusTiles; ty--) {
    const tile = { tx: 0, ty }
    if (isLava(params, tile) && !isLava(params, { tx: -1, ty }) && !isLava(params, { tx: -2, ty }))
      return tile
  }
  throw new Error('no lava down column 0')
}

function isLava(params: PlanetParams, tile: TilePoint): boolean {
  return isLavaCell(cellAt(EMPTY_WORLD, params, tile))
}

describe('hazard barometer', () => {
  it('warns of a lava pocket two cells ahead of the drill', () => {
    const { session, params } = heatPlanetEight()
    const lava = lavaTileOf(params)
    standAt(session, 1, { tx: lava.tx - 2, ty: lava.ty }, FACING.right)
    expect(barometerWarningsOf(session.state(), 'p1', LOOKAHEAD)[0]).toEqual({
      tile: lava,
      cellsAhead: 2,
      hazard: 'lava',
    })
  })

  it('says nothing of lava beyond its lookahead or behind the drill', () => {
    const { session, params } = heatPlanetEight()
    const lava = lavaTileOf(params)
    standAt(session, 1, { tx: lava.tx - 2, ty: lava.ty }, FACING.left)
    const behind = barometerWarningsOf(session.state(), 'p1', LOOKAHEAD)
    expect(behind.some((warning) => warning.tile.tx === lava.tx)).toBe(false)
    standAt(session, 2, { tx: lava.tx - 2, ty: lava.ty }, FACING.right)
    expect(barometerWarningsOf(session.state(), 'p1', 1)).toEqual([])
  })

  it('warns of breached lining ahead, where a collapse can start', () => {
    const session = createScriptedSession()
    const stand = { tx: GROUND.tx, ty: GROUND.ty - 30 }
    const centre = { x: stand.tx * MM + MM / 2, y: stand.ty * MM + MM / 2 }
    session.submit(1, carveCircleCommand({ ...centre, radius: BORE_MM, amount: SOLID_DENSITY }))
    session.submit(1, lineCasingCommand({ ...centre, grade: 3 }))
    session.submit(1, gnawCasingCommand(centre.x, centre.y))
    standAt(session, 1, stand, FACING.down)
    const hazards = barometerWarningsOf(session.state(), 'p1', LOOKAHEAD).map((w) => w.hazard)
    expect(hazards).toContain('collapse')
  })

  it('warns of nothing in plain, unlined ground', () => {
    const session = createScriptedSession()
    standAt(session, 1, { tx: GROUND.tx, ty: GROUND.ty - 30 }, FACING.down)
    expect(barometerWarningsOf(session.state(), 'p1', LOOKAHEAD)).toEqual([])
  })

  it('reads nothing before the miner reports a pose', () => {
    expect(barometerWarningsOf(createScriptedSession().state(), 'p1', LOOKAHEAD)).toEqual([])
  })
})
