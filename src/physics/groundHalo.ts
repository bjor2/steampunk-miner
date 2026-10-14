/**
 * The Rapier side of the collider halo (decision #36 Collision): one fixed trimesh collider per
 * collision block near the vehicle, its walls the block's contour segments extruded along Z. Added,
 * rebuilt and removed as the halo moves or a chunk under a block changes. The ONLY writer of ground
 * colliders; which blocks belong in it, and their segments, are the pure rules in `colliderHalo`.
 * While a glide passes through a cell (ticket 390) the block over it is rebuilt without that cell's
 * walls, and rebuilt whole once the glide ends.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { COLLISION_BLOCK_METRES, MM_PER_METRE, WALL_HALF_DEPTH } from '../constants/physics'
import type { RenderOrigin } from '../systems/render/renderOrigin'
import {
  blocksAround,
  chunksUnderBlock,
  passThroughInBlock,
  wallSegmentsOf,
  type BlockPoint,
} from '../systems/vehicle/colliderHalo'
import type { DensityAt } from '../systems/world/groundContour'
import type { TilePoint } from '../systems/world/tileGrid'

type Rapier = typeof RAPIER

/** What the halo reads of the ground: density, and each chunk's version (its delta's identity). */
export interface HaloGround {
  densityAt: DensityAt
  chunkVersion(cx: number, cy: number): unknown
}

export interface GroundHalo {
  /**
   * Keeps the blocks round `centre` current, with no walls inside `passThrough`'s square; cheap
   * when nothing moved or changed.
   */
  syncAround(
    centre: BlockPoint,
    worldVersion: unknown,
    ground: HaloGround,
    passThrough?: TilePoint | null,
  ): void
  /** Measures every collider from another render origin: they stay where they are on the planet. */
  moveOrigin(origin: RenderOrigin): void
  /** How many ground colliders exist now (the #4 budget counts them). */
  colliderCount(): number
  dispose(): void
}

interface BlockCollider {
  block: BlockPoint
  versions: unknown[]
  /** The pass-through cell the walls were built without, when it lies in this block. */
  passThrough: TilePoint | null
  collider: RAPIER.Collider | null
}

/** What the halo was last synced for. */
interface HaloSync {
  bx: number
  by: number
  worldVersion: unknown
  passThrough: TilePoint | null
}

/** What `refreshWanted` builds each block from. */
interface BlockSource {
  ground: HaloGround
  passThrough: TilePoint | null
  frame: HaloFrame
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
  let last: HaloSync | null = null

  return {
    syncAround(centre, worldVersion, ground, passThrough = null) {
      const sync = { ...centre, worldVersion, passThrough }
      if (last !== null && isSameSync(last, sync)) return
      last = sync
      const wanted = new Map(blocksAround(centre, radiusBlocks).map((b) => [keyOf(b), b]))
      removeUnwanted(world, blocks, wanted)
      refreshWanted(rapier, world, blocks, wanted, { ground, passThrough, frame })
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

function isSameSync(a: HaloSync, b: HaloSync): boolean {
  return (
    a.bx === b.bx &&
    a.by === b.by &&
    a.worldVersion === b.worldVersion &&
    isSameCell(a.passThrough, b.passThrough)
  )
}

function isSameCell(a: TilePoint | null, b: TilePoint | null): boolean {
  if (a === null || b === null) return a === b
  return a.tx === b.tx && a.ty === b.ty
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

/** Builds new blocks and rebuilds those whose chunks or pass-through changed since they were built. */
function refreshWanted(
  rapier: Rapier,
  world: RAPIER.World,
  blocks: Map<string, BlockCollider>,
  wanted: ReadonlyMap<string, BlockPoint>,
  source: BlockSource,
): void {
  for (const [key, block] of wanted) {
    const built = builtFromOf(block, source)
    const current = blocks.get(key)
    if (current !== undefined && isBuiltFrom(current, built)) continue
    if (current !== undefined) removeCollider(world, current)
    const collider = createWalls(rapier, world, block, source, built.passThrough)
    blocks.set(key, { block, ...built, collider })
  }
}

/** The chunk versions and the pass-through cell a block's walls are built from now. */
function builtFromOf(block: BlockPoint, source: BlockSource) {
  return {
    versions: chunksUnderBlock(block).map(({ cx, cy }) => source.ground.chunkVersion(cx, cy)),
    passThrough: passThroughInBlock(block, source.passThrough),
  }
}

function isBuiltFrom(
  current: BlockCollider,
  built: { versions: unknown[]; passThrough: TilePoint | null },
): boolean {
  return (
    isSameVersions(current.versions, built.versions) &&
    isSameCell(current.passThrough, built.passThrough)
  )
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
  { ground, frame }: BlockSource,
  passThrough: TilePoint | null,
): RAPIER.Collider | null {
  const origin = frame.origin
  const segments = wallSegmentsOf(block, ground.densityAt, passThrough)
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
