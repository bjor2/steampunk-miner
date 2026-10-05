/**
 * The Rapier side of the collider halo (decision #36 Collision): one fixed trimesh collider per
 * collision block near the vehicle, its walls the block's contour segments extruded along Z. Added,
 * rebuilt and removed as the halo moves or a chunk under a block changes. The ONLY writer of ground
 * colliders; which blocks belong in it, and their segments, are the pure rules in `colliderHalo`.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { WALL_HALF_DEPTH } from '../constants/physics'
import {
  blocksAround,
  chunksUnderBlock,
  wallSegmentsOf,
  type BlockPoint,
} from '../systems/vehicle/colliderHalo'
import type { DensityAt } from '../systems/world/groundContour'

type Rapier = typeof RAPIER

/** What the halo reads of the ground: density, and each chunk's version (its delta's identity). */
export interface HaloGround {
  densityAt: DensityAt
  chunkVersion(cx: number, cy: number): unknown
}

export interface GroundHalo {
  /** Keeps the blocks round `centre` current; cheap when nothing moved or changed. */
  syncAround(centre: BlockPoint, worldVersion: unknown, ground: HaloGround): void
  /** How many ground colliders exist now (the #4 budget counts them). */
  colliderCount(): number
  dispose(): void
}

interface BlockCollider {
  versions: unknown[]
  collider: RAPIER.Collider | null
}

export function createGroundHalo(
  rapier: Rapier,
  world: RAPIER.World,
  radiusBlocks: number,
): GroundHalo {
  const blocks = new Map<string, BlockCollider>()
  let last: { bx: number; by: number; worldVersion: unknown } | null = null

  return {
    syncAround(centre, worldVersion, ground) {
      const isSame =
        last?.bx === centre.bx && last.by === centre.by && last.worldVersion === worldVersion
      if (isSame) return
      last = { ...centre, worldVersion }
      const wanted = new Map(blocksAround(centre, radiusBlocks).map((b) => [keyOf(b), b]))
      removeUnwanted(world, blocks, wanted)
      refreshWanted(rapier, world, blocks, wanted, ground)
    },
    colliderCount: () => countColliders(blocks),
    dispose() {
      removeUnwanted(world, blocks, new Map())
      last = null
    },
  }
}

function keyOf(block: BlockPoint): string {
  return `${block.bx},${block.by}`
}

function countColliders(blocks: ReadonlyMap<string, BlockCollider>): number {
  let count = 0
  for (const block of blocks.values()) if (block.collider !== null) count++
  return count
}

function removeUnwanted(
  world: RAPIER.World,
  blocks: Map<string, BlockCollider>,
  wanted: ReadonlyMap<string, BlockPoint>,
): void {
  for (const [key, block] of blocks) {
    if (wanted.has(key)) continue
    removeCollider(world, block)
    blocks.delete(key)
  }
}

/** Builds new blocks and rebuilds those whose chunks changed since they were built. */
function refreshWanted(
  rapier: Rapier,
  world: RAPIER.World,
  blocks: Map<string, BlockCollider>,
  wanted: ReadonlyMap<string, BlockPoint>,
  ground: HaloGround,
): void {
  for (const [key, block] of wanted) {
    const versions = chunksUnderBlock(block).map(({ cx, cy }) => ground.chunkVersion(cx, cy))
    const current = blocks.get(key)
    if (current !== undefined && isSameVersions(current.versions, versions)) continue
    if (current !== undefined) removeCollider(world, current)
    blocks.set(key, { versions, collider: createWalls(rapier, world, block, ground.densityAt) })
  }
}

function isSameVersions(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((version, index) => version === b[index])
}

function removeCollider(world: RAPIER.World, block: BlockCollider): void {
  if (block.collider !== null) world.removeCollider(block.collider, false)
}

/** Each segment becomes a vertical quad of two triangles; a block with no ground edge has none. */
function createWalls(
  rapier: Rapier,
  world: RAPIER.World,
  block: BlockPoint,
  densityAt: DensityAt,
): RAPIER.Collider | null {
  const segments = wallSegmentsOf(block, densityAt)
  if (segments.length === 0) return null
  const count = segments.length / 4
  const vertices = new Float32Array(count * 12)
  const indices = new Uint32Array(count * 6)
  for (let at = 0; at < count; at++) writeWall(vertices, indices, segments, at)
  return world.createCollider(rapier.ColliderDesc.trimesh(vertices, indices))
}

function writeWall(
  vertices: Float32Array,
  indices: Uint32Array,
  segments: readonly number[],
  at: number,
): void {
  const [ax, ay, bx, by] = segments.slice(at * 4, at * 4 + 4)
  vertices.set(
    [
      ax,
      ay,
      -WALL_HALF_DEPTH,
      bx,
      by,
      -WALL_HALF_DEPTH,
      bx,
      by,
      WALL_HALF_DEPTH,
      ax,
      ay,
      WALL_HALF_DEPTH,
    ],
    at * 12,
  )
  const first = at * 4
  indices.set([first, first + 1, first + 2, first, first + 2, first + 3], at * 6)
}
