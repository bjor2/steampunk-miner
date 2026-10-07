import { describe, expect, it } from 'vitest'
import { dockInBay } from '../../../systems/authority/scriptedSession'
import { FACING } from '../../../systems/vehicle/vehiclePose'
import type { TilePoint } from '../../../systems/world/tileGrid'
import { chargesLeftOf } from '../../power-up-core'
import { buriedTile, ofType, oreAround, press, sessionWith, standAt } from '../terrainTestSession'
import { LODESTONE_BEACON_ID } from './lodestoneBeacon'
import { terrainToolsOf } from './terrainSection'

// The lodestone beacon (#162 row, 3.1, 4.3, G&V feel pass C8): plant it, dock, and the common
// ore within 10 tiles has drawn into a vein beside it, a delayed edit keyed to the planting tick.
// At most 256 swaps per beacon, at most 64 a tick; one live beacon per planet; no ore made or lost.

const LODESTONE = { 'powerup.1': LODESTONE_BEACON_ID }
const GATHER_RADIUS = 10

function distanceSq(a: TilePoint, b: TilePoint): number {
  return (a.tx - b.tx) ** 2 + (a.ty - b.ty) ** 2
}

function plantAt(depth: number) {
  const session = sessionWith(LODESTONE)
  const stand = buriedTile(depth)
  standAt(session, 5, stand, FACING.right)
  session.submit(10, press())
  session.advanceTo(12)
  return { session, stand }
}

function plantAndDock(depth: number) {
  const { session, stand } = plantAt(depth)
  const before = oreAround(session.state(), stand, GATHER_RADIUS)
  dockInBay(session, 40, 'sell')
  session.advanceTo(60)
  return { session, stand, before, after: oreAround(session.state(), stand, GATHER_RADIUS) }
}

describe('lodestone beacon', () => {
  it('plants at the miner’s tile, uses the unit and changes no cell', () => {
    const { session, stand } = plantAt(12)
    expect(terrainToolsOf(session.state(), 'p1').beacon).toMatchObject({
      ...stand,
      plantedTick: 10,
    })
    expect(ofType(session.events(), 'terrain-tools.BeaconPlanted')).toHaveLength(1)
    expect(ofType(session.events(), 'terrain-tools.TerrainEdited')).toEqual([])
    expect(chargesLeftOf(session.state(), 'p1', LODESTONE_BEACON_ID)).toBe(0)
  })

  it('refuses a second beacon while one waits on the planet, at no cost', () => {
    const { session } = plantAt(12)
    session.submit(20, {
      type: 'debug.power-up-core.setCharges',
      payload: { itemId: LODESTONE_BEACON_ID, chargesLeft: 1 },
    })
    session.submit(30, press())
    session.advanceTo(32)
    expect(ofType(session.events(), 'power-up-core.PowerUpRefused')).toMatchObject([
      { reason: 'terrain-tools.beacon_live' },
    ])
    expect(chargesLeftOf(session.state(), 'p1', LODESTONE_BEACON_ID)).toBe(1)
  })

  it('gathers at the dock: ore drawn toward the beacon, none made or lost, the beacon spent', () => {
    const { session, stand, before, after } = plantAndDock(12)
    const [edited] = ofType(session.events(), 'terrain-tools.TerrainEdited')
    expect(edited).toMatchObject({
      itemId: LODESTONE_BEACON_ID,
      originTx: stand.tx,
      originTy: stand.ty,
    })
    const pull = (ore: typeof before) =>
      ore.reduce((sum, { tile }) => sum + distanceSq(tile, stand), 0)
    expect(after.map(({ cell }) => cell).sort()).toEqual(before.map(({ cell }) => cell).sort())
    expect(pull(after)).toBeLessThan(pull(before))
    expect(terrainToolsOf(session.state(), 'p1').beacon).toBeNull()
  })

  it('swaps at most 256 cells per beacon, at most 64 a tick', () => {
    const { session } = plantAndDock(12)
    const [edited] = ofType(session.events(), 'terrain-tools.TerrainEdited')
    if (edited?.type !== 'terrain-tools.TerrainEdited') throw new Error('no gather')
    expect(edited.cellsChanged).toBeGreaterThan(0)
    expect(edited.cellsChanged).toBeLessThanOrEqual(256)
    expect(edited.cellsChanged % 2).toBe(0)
    const ticks = new Set(ofType(session.events(), 'GroundChanged').map(({ tick }) => tick))
    expect(ticks.size).toBeGreaterThanOrEqual(Math.ceil(edited.cellsChanged / 64))
  })

  it('gathers the same vein whenever its owner docks, keyed to the planting tick', () => {
    const early = plantAndDock(12)
    const late = plantAt(12)
    dockInBay(late.session, 90, 'sell')
    late.session.advanceTo(120)
    const hashOf = (events: ReturnType<typeof early.session.events>) =>
      ofType(events, 'terrain-tools.TerrainEdited').map((event) =>
        event.type === 'terrain-tools.TerrainEdited' ? event.editHash : null,
      )
    expect(hashOf(late.session.events())).toEqual(hashOf(early.session.events()))
  })
})
