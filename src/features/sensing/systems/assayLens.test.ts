import { describe, expect, it } from 'vitest'
import type { AuthorityState } from '../../../systems/authority/authorityState'
import { carveCircleCommand } from '../../../systems/authority/groundCommands'
import { sellBayUnitPrice } from '../../../systems/authority/platformServices'
import {
  createScriptedSession,
  GROUND,
  PARAMS,
  poseAbove,
} from '../../../systems/authority/scriptedSession'
import { oreTypeAtTile } from '../../../systems/authority/tileOre'
import { saleTierOf } from '../../../systems/registries/oreTypes'
import { FACING, type Facing } from '../../../systems/vehicle/vehiclePose'
import { SOLID_DENSITY } from '../../../systems/world/sampleGrid'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { CELL_KIND, isAirCell, kindOfCell } from '../../../systems/world/worldCell'
import { cellAt } from '../../../systems/world/worldState'
import { assayReadingsOf } from './assayLens'

// The assay lens (#162 Sensing row, 4.4): ore cells within its radius that the miner can see, with
// family, grade, rarity lead, unit price and gate; never through rock.

const MM = 1000
const RADIUS = 6
/** Deep in band 2 under the scripted column, where ore patches are thick. */
const STAND = { tx: GROUND.tx, ty: GROUND.ty - 40 }

function minerAt(tile: TilePoint, cavityRadiusMm: number | null) {
  return sessionOfMinerAt(tile, cavityRadiusMm).state()
}

function sessionOfMinerAt(tile: TilePoint, cavityRadiusMm: number | null) {
  const session = createScriptedSession()
  const centre = { x: tile.tx * MM + MM / 2, y: tile.ty * MM + MM / 2 }
  if (cavityRadiusMm !== null) {
    session.submit(
      1,
      carveCircleCommand({ ...centre, radius: cavityRadiusMm, amount: SOLID_DENSITY }),
    )
  }
  const { payload } = poseAbove(GROUND, FACING.down)
  session.submit(1, { type: 'reportPose', payload: { ...payload, ...centre, vx: 0, vy: 0 } })
  return session
}

const isSameTile = (a: TilePoint, b: TilePoint) => a.tx === b.tx && a.ty === b.ty

/** An open tile beside `tile` and the facing that drills `tile` from it. */
function openSideOf(state: AuthorityState, tile: TilePoint): [TilePoint, Facing] {
  const sides: [TilePoint, Facing][] = [
    [{ tx: tile.tx, ty: tile.ty + 1 }, FACING.down],
    [{ tx: tile.tx - 1, ty: tile.ty }, FACING.right],
    [{ tx: tile.tx + 1, ty: tile.ty }, FACING.left],
  ]
  const side = sides.find(([beside]) => isAirCell(cellAt(state.world, PARAMS, beside)))
  if (side === undefined) throw new Error('no open side beside the lens cell')
  return side
}

const distanceSqOf = (a: TilePoint, b: TilePoint) => (a.tx - b.tx) ** 2 + (a.ty - b.ty) ** 2

describe('assay lens', () => {
  it('reads only ore cells, each within its radius of the miner', () => {
    const state = minerAt(STAND, 4600)
    const readings = assayReadingsOf(state, 'p1', RADIUS)
    expect(readings.length).toBeGreaterThan(0)
    for (const { tile } of readings) {
      expect(kindOfCell(cellAt(state.world, PARAMS, tile))).toBe(CELL_KIND.ore)
      expect(distanceSqOf(tile, STAND)).toBeLessThanOrEqual(RADIUS * RADIUS)
    }
  })

  it('sees no further than the rock touching the hull when the miner stands in solid ground', () => {
    const readings = assayReadingsOf(minerAt(STAND, null), 'p1', RADIUS)
    expect(readings.every(({ tile }) => distanceSqOf(tile, STAND) <= 2)).toBe(true)
  })

  it('reads deeper into an open cave than through the rock around it', () => {
    const inRock = assayReadingsOf(minerAt(STAND, null), 'p1', RADIUS)
    const inCave = assayReadingsOf(minerAt(STAND, 4600), 'p1', RADIUS)
    const farthest = Math.max(...inCave.map(({ tile }) => distanceSqOf(tile, STAND)))
    expect(inCave.length).toBeGreaterThan(inRock.length)
    expect(farthest).toBeGreaterThan(9)
  })

  it("names each cell's ore family and grade and the Sell bay's price for one unit", () => {
    const state = minerAt(STAND, 4600)
    for (const reading of assayReadingsOf(state, 'p1', RADIUS)) {
      const ore = oreTypeAtTile(state, reading.tile)!
      expect(reading).toMatchObject({ oreId: ore.id, family: ore.family, grade: ore.grade })
      expect(reading.unitPrice).toEqual(sellBayUnitPrice(state, 'p1', saleTierOf(ore)))
    }
  })

  it('gives a planet-1 cell no gate and a lead of at most two tiers', () => {
    const readings = assayReadingsOf(minerAt(STAND, 4600), 'p1', RADIUS)
    expect(new Set(readings.map((reading) => reading.gate))).toEqual(new Set(['none']))
    expect(readings.every((reading) => reading.lead <= 2)).toBe(true)
  })

  it("leaves every species' rarity unspecified until the player has met it (ticket 454)", () => {
    const readings = assayReadingsOf(minerAt(STAND, 4600), 'p1', RADIUS)
    expect(readings.some(({ rarity }) => rarity.hasSpecies)).toBe(true)
    expect(readings.every(({ rarity }) => rarity.seen === null)).toBe(true)
  })

  it("names a species' rarity once the drill has touched a cell of it", () => {
    const session = sessionOfMinerAt(STAND, 4600)
    const state = session.state()
    const [touched] = assayReadingsOf(state, 'p1', RADIUS).filter(({ rarity }) => rarity.hasSpecies)
    const [stand, facing] = openSideOf(state, touched.tile)
    session.submit(2, poseAbove({ tx: stand.tx, ty: stand.ty - 1 }, facing))
    session.submit(3, { type: 'drillTile', payload: { ...touched.tile, ticks: 1 } })
    const read = assayReadingsOf(session.state(), 'p1', RADIUS).find(({ tile }) =>
      isSameTile(tile, touched.tile),
    )
    expect(touched.rarity.seen).toBeNull()
    expect(read?.rarity.seen?.lead).toBe(touched.lead)
  })

  it('reads nothing before the miner reports a pose', () => {
    expect(assayReadingsOf(createScriptedSession().state(), 'p1', RADIUS)).toEqual([])
  })
})
