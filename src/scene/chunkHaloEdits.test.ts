import { Group, type DataTexture, type Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { chunkDensityHaloOf } from '../systems/render/densityHalo'
import { clearDisc } from '../systems/world/groundEdit'
import { planetParamsFor } from '../systems/world/planetParams'
import { CHUNK_SIZE, firstTileOfChunk } from '../systems/world/tileGrid'
import { currentDensityOfChunk, EMPTY_WORLD, type WorldState } from '../systems/world/worldState'
import { createChunkMeshPool, type TerrainView } from './chunkMeshPool'
import { createTerrainMaterial } from './terrainMaterial'

// Done-when B on ticket 570: the rendered density halo of an edited chunk updates in the same frame
// as the authority's edit, while the chunk's tiles wait for their rebuild under the cap of ticket
// 330. Built on the main-thread path the pool takes with no chunk worker.

const params = planetParamsFor(83921, 1)
/** Chunk (0, 8) of planet 1, under the surface. */
const CHUNK = { cx: 0, cy: 8 }
const CENTRE_MM = { x: 16_000, y: CHUNK.cy * CHUNK_SIZE * 1000 + 16_000 }
/** Frames the pool gets to build the chunks in view before the edit. */
const SETTLE_FRAMES = 200

function viewOf(world: WorldState): TerrainView {
  return {
    params,
    world,
    centre: { x: CENTRE_MM.x / 1000, y: CENTRE_MM.y / 1000 },
    viewRadius: 4,
    ahead: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
  }
}

function cutInChunk(world: WorldState): WorldState {
  const disc = { xMm: CENTRE_MM.x, yMm: CENTRE_MM.y, radiusMm: 950, floorRadiusMm: null }
  return clearDisc(world, params, disc, 255).world
}

/** The density texture the chunk's mesh hands the material just before drawing it. */
function drawnHaloOf(parent: Group, material: ReturnType<typeof createTerrainMaterial>) {
  const mesh = parent.children.find(
    (child) =>
      child.position.x === firstTileOfChunk(CHUNK.cx) &&
      child.position.y === firstTileOfChunk(CHUNK.cy),
  ) as Mesh
  mesh.onBeforeRender(...([] as unknown as Parameters<Mesh['onBeforeRender']>))
  return material.uniforms.uDensity.value as DataTexture
}

describe('chunk mesh halo (ticket 570)', () => {
  it("shows an edit in the chunk's density halo the frame the world changes", () => {
    const parent = new Group()
    const material = createTerrainMaterial('lite')
    const pool = createChunkMeshPool(parent, material, null)
    const view = viewOf(EMPTY_WORLD)
    pool.sync(view)
    for (let frame = 0; frame < SETTLE_FRAMES && pool.unbuiltVisibleChunkCount() > 0; frame++) {
      pool.sync(view)
    }

    const edited = cutInChunk(EMPTY_WORLD)
    pool.sync(viewOf(edited))

    const after = drawnHaloOf(parent, material)
    const density = (cx: number, cy: number) => currentDensityOfChunk(edited, params, cx, cy)
    expect(after.image.data).toEqual(chunkDensityHaloOf(density, CHUNK.cx, CHUNK.cy))
    pool.dispose()
  })
})
