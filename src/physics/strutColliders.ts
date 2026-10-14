/**
 * The Rapier side of the bore struts (ticket 379, Content's strut bore on #310): one fixed cuboid
 * collider per standing strut, its plank (`systems/vehicle/strutPlank`) extruded along Z like the
 * ground's walls, so the rig lands and drives on it. Added when the authority's struts gain one,
 * removed when one falls; cheap when the struts did not change. The ONLY writer of strut colliders.
 *
 * Measured from the floating render origin as the ground halo is (ticket 339): a move of the origin
 * moves every plank by the same whole metres, so none jumps on the planet.
 */
import type RAPIER from '@dimforge/rapier3d-compat'
import { MM_PER_METRE, WALL_HALF_DEPTH } from '../constants/physics'
import type { StandingStruts } from '../systems/authority/bore/strutState'
import type { RenderOrigin } from '../systems/render/renderOrigin'
import type { Vector2 } from '../systems/vehicle/localFrame'
import { isPointOnPlank, strutPlankOf, type StrutPlank } from '../systems/vehicle/strutPlank'

type Rapier = typeof RAPIER

export interface StrutColliders {
  /** Keeps one collider per standing strut; nothing to do while `struts` is the same object. */
  sync(struts: StandingStruts): void
  /** Measures every plank from another render origin: they stay where they are on the planet. */
  moveOrigin(origin: RenderOrigin): void
  /** Whether a point in planet metres lies on a standing plank: the rig's ground probe. */
  isOnPlank(point: Vector2): boolean
  colliderCount(): number
  dispose(): void
}

interface PlankCollider {
  /** The strut it was built for: a new one in its cell is rebuilt. */
  strut: object
  plank: StrutPlank
  collider: RAPIER.Collider
}

export function createStrutColliders(
  rapier: Rapier,
  world: RAPIER.World,
  origin: RenderOrigin,
): StrutColliders {
  const planks = new Map<string, PlankCollider>()
  const frame = { origin }
  let synced: StandingStruts | null = null

  return {
    sync(struts) {
      if (struts === synced) return
      synced = struts
      removeFallen(world, planks, struts)
      addStanding(rapier, world, planks, struts, frame.origin)
    },
    moveOrigin(next) {
      frame.origin = next
      for (const plank of planks.values()) placeFromOrigin(plank, next)
    },
    isOnPlank: (point) => isOnAnyPlank(planks, point),
    colliderCount: () => planks.size,
    dispose() {
      removeFallen(world, planks, {})
      synced = null
    },
  }
}

function removeFallen(
  world: RAPIER.World,
  planks: Map<string, PlankCollider>,
  struts: StandingStruts,
): void {
  for (const [key, plank] of planks) {
    if (struts[key] === plank.strut) continue
    world.removeCollider(plank.collider, false)
    planks.delete(key)
  }
}

function addStanding(
  rapier: Rapier,
  world: RAPIER.World,
  planks: Map<string, PlankCollider>,
  struts: StandingStruts,
  origin: RenderOrigin,
): void {
  for (const [key, strut] of Object.entries(struts)) {
    if (planks.has(key)) continue
    const plank = strutPlankOf(strut)
    planks.set(key, { strut, plank, collider: createPlank(rapier, world, plank, origin) })
  }
}

function createPlank(
  rapier: Rapier,
  world: RAPIER.World,
  plank: StrutPlank,
  origin: RenderOrigin,
): RAPIER.Collider {
  const at = fromOrigin(plank.centre, origin)
  const desc = rapier.ColliderDesc.cuboid(plank.halfLength, plank.halfThickness, WALL_HALF_DEPTH)
    .setTranslation(at.x, at.y, 0)
    .setRotation(turnAboutZ(plank.along))
  return world.createCollider(desc)
}

function placeFromOrigin(plank: PlankCollider, origin: RenderOrigin): void {
  const at = fromOrigin(plank.plank.centre, origin)
  plank.collider.setTranslation({ x: at.x, y: at.y, z: 0 })
}

function isOnAnyPlank(planks: ReadonlyMap<string, PlankCollider>, point: Vector2): boolean {
  for (const { plank } of planks.values()) if (isPointOnPlank(plank, point)) return true
  return false
}

function fromOrigin(point: Vector2, origin: RenderOrigin): Vector2 {
  return { x: point.x - origin.xMm / MM_PER_METRE, y: point.y - origin.yMm / MM_PER_METRE }
}

/** The quaternion turning the box's x axis onto `along`, about Z. */
function turnAboutZ(along: Vector2): RAPIER.Rotation {
  const half = Math.atan2(along.y, along.x) / 2
  return { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) }
}
