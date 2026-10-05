import { describe, expect, it } from 'vitest'
import { FACING } from '../vehicle/vehiclePose'
import { bandOfTile } from '../world/planetGeometry'
import { surfaceRowOfColumn, type TilePoint } from '../world/tileGrid'
import type { DomainEvent } from './domainEvent'
import {
  coreTiles,
  createScriptedSession,
  FREEZE_ENEMIES,
  PARAMS,
  poseAbove,
} from './scriptedSession'

const COLUMN = 20

/** The first tile of a band straight down column 20. */
function firstTileOfBand(band: number): TilePoint {
  let ty = surfaceRowOfColumn(COLUMN, PARAMS.radiusTiles)
  while (bandOfTile(PARAMS, COLUMN, ty) < band) ty--
  return { tx: COLUMN, ty }
}

/** A pose report with the vehicle's centre in `tile`. */
const poseIn = (tile: TilePoint) => poseAbove({ tx: tile.tx, ty: tile.ty - 1 }, FACING.down)

const casingEdges = (events: readonly DomainEvent[]) =>
  events.filter(
    (event) => event.type === 'CasingGradeInsufficient' || event.type === 'CasingGradeSufficient',
  )

describe('casing grade telegraph', () => {
  it('logs the grade as insufficient the first report in a band above it, and only then', () => {
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    expect(casingEdges(session.submit(1, poseIn(firstTileOfBand(1))))).toEqual([])
    expect(casingEdges(session.submit(13, poseIn(firstTileOfBand(2))))).toEqual([
      expect.objectContaining({ type: 'CasingGradeInsufficient', band: 2, grade: 1, required: 2 }),
    ])
    expect(casingEdges(session.submit(25, poseIn(firstTileOfBand(2))))).toEqual([])
    expect(session.vehicle().casingShortBand).toBe(2)
  })

  it('logs the edge back when the vehicle returns to a band its grade holds', () => {
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    session.submit(1, poseIn(firstTileOfBand(3)))
    expect(casingEdges(session.submit(13, poseIn(firstTileOfBand(1))))).toEqual([
      expect.objectContaining({ type: 'CasingGradeSufficient', band: 1, grade: 1 }),
    ])
    expect(session.vehicle().casingShortBand).toBeNull()
  })

  it('logs nothing in band 4 at grade 4', () => {
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    session.submit(0, { type: 'debug.setCasingGrade', payload: { grade: 4 } })
    expect(casingEdges(session.submit(1, poseIn(firstTileOfBand(4))))).toEqual([])
  })

  it('needs grade 5 in the core, reported as band 6', () => {
    const session = createScriptedSession()
    session.submit(0, FREEZE_ENEMIES)
    session.submit(0, { type: 'debug.setCasingGrade', payload: { grade: 4 } })
    const [core] = coreTiles(1)
    expect(casingEdges(session.submit(1, poseIn(core)))).toEqual([
      expect.objectContaining({ type: 'CasingGradeInsufficient', band: 6, grade: 4, required: 5 }),
    ])
  })
})
