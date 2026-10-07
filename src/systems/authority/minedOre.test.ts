import { describe, expect, it } from 'vitest'
import { oreTier } from '../economy/oreEconomy'
import { ORE_TYPE_REGISTRY, type OreType } from '../registries/oreTypes'
import { addToRegistry, withFreshRegistrySet } from '../registries/seal'
import { FACING } from '../vehicle/vehiclePose'
import { depthTilesAt } from '../world/planetGeometry'
import { planetParamsFor } from '../world/planetParams'
import { chunkKey, chunkOfTile, type TilePoint } from '../world/tileGrid'
import { familyOfCell, oreCell, RESOURCE_FAMILY } from '../world/worldCell'
import { EMPTY_WORLD, materialCellAt } from '../world/worldState'
import type { DomainEvent } from './domainEvent'
import { minedOreOf, resourceTierOf } from './minedOre'
import {
  createScriptedSession,
  drill,
  PARAMS,
  poseAbove,
  surfaceOreTiles,
  WORLD_SEED,
} from './scriptedSession'

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

const copper: OreType = {
  id: 'ores.copper',
  name: 'Copper',
  family: 'copper',
  cellFamily: RESOURCE_FAMILY.metal,
  tier: 1,
  grade: 0,
  iconId: 'none',
  requires: [],
}

/** A fake `ores` catalogue that calls every ore copper. */
function registerCopperProvider(): void {
  addToRegistry(ORE_TYPE_REGISTRY, 'ores', {
    id: 'ores.catalogue',
    indexTag: 'ores.copper-only',
    oreTypeOf: () => copper,
    bitIndexOf: () => 0,
    catalogue: () => [copper],
  })
}

const signatureCopper: OreType = { ...copper, id: 'ores.copper_sig', signature: true }

/** A fake catalogue whose every ore is a signature (#141). */
function registerSignatureProvider(): void {
  addToRegistry(ORE_TYPE_REGISTRY, 'ores', {
    id: 'ores.catalogue',
    indexTag: 'ores.signature-only',
    oreTypeOf: () => signatureCopper,
    bitIndexOf: () => 0,
    catalogue: () => [signatureCopper],
  })
}

function firstCargoAdded(events: readonly DomainEvent[]) {
  return events.find((event) => event.type === 'CargoAdded')
}

function oreOfTile(tile: TilePoint) {
  return minedOreOf(PARAMS, tile, materialCellAt(EMPTY_WORLD, PARAMS, tile))
}

describe('mined ore identity (#122)', () => {
  it("names the ore by the ore catalogue's id when a slice provides one (#155 3.5)", () => {
    const [ore] = surfaceOreTiles(1)
    const added = withFreshRegistrySet(registerCopperProvider, () => mineInOrder([ore])).find(
      (event) => event.type === 'CargoAdded',
    )
    expect(added).toMatchObject({ resourceTier: 1, oreId: 'ores.copper' })
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

  it("names the catalogue's family and signature flag on CargoAdded (#141 acceptance 8, #223)", () => {
    const [ore] = surfaceOreTiles(1)
    const plain = firstCargoAdded(
      withFreshRegistrySet(registerCopperProvider, () => mineInOrder([ore])),
    )
    const signature = firstCargoAdded(
      withFreshRegistrySet(registerSignatureProvider, () => mineInOrder([ore])),
    )
    expect(plain).toMatchObject({ oreId: 'ores.copper', family: 'copper', signature: false })
    expect(signature).toMatchObject({ oreId: 'ores.copper_sig', family: 'copper', signature: true })
  })

  it('leaves family and signature off CargoAdded with the kernel default, as before (#223)', () => {
    const [ore] = surfaceOreTiles(1)
    const added = firstCargoAdded(mineInOrder([ore]))
    expect(added).not.toHaveProperty('family')
    expect(added).not.toHaveProperty('signature')
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

describe('ore tier of a cell (#140 cell storage, #223)', () => {
  const planet3 = planetParamsFor(WORLD_SEED, 3)

  it("is band 1's ore tier plus the cell's offset, for every offset from 0 to 6", () => {
    const offsets = [0, 1, 2, 3, 4, 5, 6]
    expect(
      offsets.map((offset) => resourceTierOf(planet3, oreCell(RESOURCE_FAMILY.metal, offset))),
    ).toEqual(offsets.map((offset) => oreTier(3, 1) + offset))
  })

  it('refuses a cell whose offset lies past band 5 with a +2 lead', () => {
    expect(() => resourceTierOf(planet3, oreCell(RESOURCE_FAMILY.crystal, 7))).toThrow(RangeError)
  })
})
