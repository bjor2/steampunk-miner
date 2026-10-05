/**
 * The Rapier side of the exposed-tile halo: one fixed cuboid collider per exposed tile near the
 * vehicle, added and removed as the halo moves or the world changes. The ONLY writer of tile
 * colliders; which tiles belong in it is the pure `exposedTilesAround` rule.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { exposedTilesAround, type IsSolidAt } from '../systems/vehicle/colliderHalo'
import type { TilePoint } from '../systems/world/tileGrid'

type Rapier = typeof RAPIER

export interface TileHalo {
  /** Rebuilds around `centre` when the centre or the world (by identity) changed since last time. */
  syncAround(centre: TilePoint, world: unknown, isSolidAt: IsSolidAt): void
  /** How many tile colliders exist now (the #22 budget counts them). */
  colliderCount(): number
  dispose(): void
}

const HALF_TILE = 0.5

export function createTileHalo(rapier: Rapier, world: RAPIER.World, radius: number): TileHalo {
  const colliders = new Map<string, RAPIER.Collider>()
  let last: { tx: number; ty: number; world: unknown } | null = null

  const rebuild = (centre: TilePoint, isSolidAt: IsSolidAt) => {
    const wanted = new Map(
      exposedTilesAround(centre, radius, isSolidAt).map((tile) => [keyOf(tile), tile]),
    )
    removeUnwanted(world, colliders, wanted)
    addMissing(rapier, world, colliders, wanted)
  }

  return {
    syncAround(centre, worldState, isSolidAt) {
      if (last?.tx === centre.tx && last.ty === centre.ty && last.world === worldState) return
      last = { ...centre, world: worldState }
      rebuild(centre, isSolidAt)
    },
    colliderCount: () => colliders.size,
    dispose() {
      removeUnwanted(world, colliders, new Map())
      last = null
    },
  }
}

function keyOf(tile: TilePoint): string {
  return `${tile.tx},${tile.ty}`
}

function removeUnwanted(
  world: RAPIER.World,
  colliders: Map<string, RAPIER.Collider>,
  wanted: ReadonlyMap<string, TilePoint>,
): void {
  for (const [key, collider] of colliders) {
    if (wanted.has(key)) continue
    world.removeCollider(collider, false)
    colliders.delete(key)
  }
}

function addMissing(
  rapier: Rapier,
  world: RAPIER.World,
  colliders: Map<string, RAPIER.Collider>,
  wanted: ReadonlyMap<string, TilePoint>,
): void {
  for (const [key, tile] of wanted) {
    if (colliders.has(key)) continue
    const desc = rapier.ColliderDesc.cuboid(HALF_TILE, HALF_TILE, HALF_TILE).setTranslation(
      tile.tx + HALF_TILE,
      tile.ty + HALF_TILE,
      0,
    )
    colliders.set(key, world.createCollider(desc))
  }
}
