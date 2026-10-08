/**
 * The Rapier side of the collider halo (decision #36 Collision): one fixed trimesh collider per
 * collision block near the vehicle, its walls the block's contour segments extruded along Z. Added,
 * rebuilt and removed as the halo moves or a chunk under a block changes. The ONLY writer of ground
 * colliders; which blocks belong in it, and their segments, are the pure rules in `colliderHalo`.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { COLLISION_BLOCK_METRES, MM_PER_METRE, WALL_HALF_DEPTH } from '../constants/physics'
import type { RenderOrigin } from '../systems/render/renderOrigin'
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
  /** Measures every collider from another render origin: they stay where they are on the planet. */
  moveOrigin(origin: RenderOrigin): void
  /** How many ground colliders exist now (the #4 budget counts them). */
  colliderCount(): number
  dispose(): void
}

interface BlockCollider {
  block: BlockPoint
  versions: unknown[]
  collider: RAPIER.Collider | null
}

/** The render origin the halo's colliders are measured from; one object, moved in place. */
interface HaloFrame {
  origin: RenderOrigin
}

export function createGroundHalo(
  rapier: Rapier,
  world: RAPIER.World,
  radiusBlocks: number,
  origin: RenderOrigin,
): GroundHalo {
  const blocks = new Map<string, BlockCollider>()
  const frame: HaloFrame = { origin }
  let last: { bx: number; by: number; worldVersion: unknown } | null = null

  return {
    syncAround(centre, worldVersion, ground) {
      const isSame =
        last?.bx === centre.bx && last.by === centre.by && last.worldVersion === worldVersion
      if (isSame) return
      last = { ...centre, worldVersion }
      const wanted = new Map(blocksAround(centre, radiusBlocks).map((b) => [keyOf(b), b]))
      removeUnwanted(world, blocks, wanted)
      refreshWanted(rapier, world, blocks, wanted, ground, frame)
    },
    moveOrigin(next) {
      frame.origin = next
      for (const block of blocks.values()) placeAtCorner(block, next)
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
  frame: HaloFrame,
): void {
  for (const [key, block] of wanted) {
    const versions = chunksUnderBlock(block).map(({ cx, cy }) => ground.chunkVersion(cx, cy))
    const current = blocks.get(key)
    if (current !== undefined && isSameVersions(current.versions, versions)) continue
    if (current !== undefined) removeCollider(world, current)
    const collider = createWalls(rapier, world, block, ground.densityAt, frame.origin)
    blocks.set(key, { block, versions, collider })
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
  origin: RenderOrigin,
): RAPIER.Collider | null {
  const segments = wallSegmentsOf(block, densityAt)
  if (segments.length === 0) return null
  const count = segments.length / 4
  const vertices = new Float32Array(count * 12)
  const indices = new Uint32Array(count * 6)
  const corner = cornerOf(block)
  for (let at = 0; at < count; at++) writeWall(vertices, indices, segments, at, corner)
  const offset = cornerFromOrigin(block, origin)
  return world.createCollider(
    rapier.ColliderDesc.trimesh(vertices, indices).setTranslation(offset.x, offset.y, 0),
  )
}

function placeAtCorner(block: BlockCollider, origin: RenderOrigin): void {
  if (block.collider === null) return
  const offset = cornerFromOrigin(block.block, origin)
  block.collider.setTranslation({ x: offset.x, y: offset.y, z: 0 })
}

/** A block's corner in planet metres: whole metres, so exact in a double. */
function cornerOf(block: BlockPoint): { x: number; y: number } {
  return { x: block.bx * COLLISION_BLOCK_METRES, y: block.by * COLLISION_BLOCK_METRES }
}

/** Whole metres both, so the difference is exact before f32 sees it. */
function cornerFromOrigin(block: BlockPoint, origin: RenderOrigin): { x: number; y: number } {
  const corner = cornerOf(block)
  return {
    x: corner.x - origin.xMm / MM_PER_METRE,
    y: corner.y - origin.yMm / MM_PER_METRE,
  }
}

function writeWall(
  vertices: Float32Array,
  indices: Uint32Array,
  segments: readonly number[],
  at: number,
  corner: { x: number; y: number },
): void {
  const [ax, ay, bx, by] = cornerRelative(segments.slice(at * 4, at * 4 + 4), corner)
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

/** A segment's ends from the block's corner: under 4 m, where f32 holds them to a micrometre. */
function cornerRelative(segment: number[], corner: { x: number; y: number }): number[] {
  return [
    segment[0] - corner.x,
    segment[1] - corner.y,
    segment[2] - corner.x,
    segment[3] - corner.y,
  ]
}
