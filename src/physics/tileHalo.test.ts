import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { MAX_TILE_COLLIDERS } from '../constants/scene'
import { createTileHalo } from './tileHalo'
import { TILE_HALO_RADIUS } from './vehicleController'

// The physics layer (docs/TESTING_INSTRUCTIONS.md): a plain Rapier world, no React, no canvas.

beforeAll(async () => {
  await RAPIER.init()
})

/** Every other tile solid: each solid tile touches air, the most colliders a halo can need. */
const isCheckerboardSolid = ({ tx, ty }: { tx: number; ty: number }) => (tx + ty) % 2 === 0

describe('tile halo', () => {
  it('stays inside the #22 collider budget even when every solid tile is exposed', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    const halo = createTileHalo(RAPIER, world, TILE_HALO_RADIUS)
    halo.syncAround({ tx: 10, ty: 290 }, 'checkerboard', isCheckerboardSolid)
    expect(halo.colliderCount()).toBeGreaterThan(0)
    expect(halo.colliderCount()).toBeLessThanOrEqual(MAX_TILE_COLLIDERS)
    halo.dispose()
    world.free()
  })
})
