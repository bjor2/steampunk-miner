import { describe, expect, it } from 'vitest'
import { FACING } from '../vehicle/vehiclePose'
import { depthTilesAt } from '../world/planetGeometry'
import { chunkKey, chunkOfTile, type TilePoint } from '../world/tileGrid'
import { familyOfCell, RESOURCE_FAMILY } from '../world/worldCell'
import { EMPTY_WORLD, materialCellAt } from '../world/worldState'
import type { DomainEvent } from './domainEvent'
import { kernelOreIdOf, minedOreOf } from './minedOre'
import { createScriptedSession, drill, PARAMS, poseAbove, surfaceOreTiles } from './scriptedSession'

/** Mines each tile clear from above, in order, refilling the tank as a dock would. */
function mineInOrder(tiles: readonly TilePoint[]): DomainEvent[] {
  const session = createScriptedSession()
  session.submit(0, { type: 'debug.setUpgrade', payload: { upgradeId: 'cargo_hold', level: 400 } })
  let tick = 0
  for (const tile of tiles) {
    session.submit(tick, { type: 'debug.setEnergy', payload: { energy: '150' } })
    session.submit(tick, poseAbove(tile, FACING.down))
    tick += 100
    session.submit(tick, drill(tile, 100))
  }
  return session.events()
}

function oreOfTile(tile: TilePoint) {
  return minedOreOf(PARAMS, tile, materialCellAt(EMPTY_WORLD, PARAMS, tile))
}

describe('mined ore identity (#122)', () => {
  it('names an ore by the kernel default id of its family and tier until a catalogue does', () => {
    expect(kernelOreIdOf({ tier: 1, cellFamily: RESOURCE_FAMILY.metal })).toBe('kernel.metal.t1')
    expect(kernelOreIdOf({ tier: 7, cellFamily: RESOURCE_FAMILY.crystal })).toBe(
      'kernel.crystal.t7',
    )
  })

  it('puts the ore id, the depth of its cell and its chunk on CargoAdded', () => {
    const [ore] = surfaceOreTiles(1)
    const added = mineInOrder([ore]).find((event) => event.type === 'CargoAdded')
    const family = familyOfCell(materialCellAt(EMPTY_WORLD, PARAMS, ore))
    expect(added).toMatchObject({
      resourceTier: 1,
      oreId: `kernel.${family === RESOURCE_FAMILY.crystal ? 'crystal' : 'metal'}.t1`,
      depthTiles: depthTilesAt(PARAMS, ore.tx, ore.ty),
      chunk: chunkKey(chunkOfTile(ore.tx), chunkOfTile(ore.ty)),
    })
  })

  it('adds the ore of a scripted dig in the order its cells were mined', () => {
    const ore = surfaceOreTiles(12)
    const added = mineInOrder(ore).flatMap((event) => (event.type === 'CargoAdded' ? [event] : []))
    expect(added.map(({ oreId, depthTiles, chunk }) => ({ oreId, depthTiles, chunk }))).toEqual(
      ore.map(oreOfTile).map(({ oreId, depthTiles, chunk }) => ({ oreId, depthTiles, chunk })),
    )
    expect(new Set(added.map(({ depthTiles }) => depthTiles)).size).toBeGreaterThan(1)
  })
})
