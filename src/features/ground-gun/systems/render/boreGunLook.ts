/**
 * The bore gun on the rig (#309 GD decision build 3, ticket 315; art #362): once the gun is
 * mounted, `vehicle-bore-gun` hangs at the point its attach use registers, so the major unlock
 * shows on the vehicle (design 37.7). The saddle stays put; the barrel turns on its trunnion to
 * the bearing the gun would fire along now. The asset is authored in its own frame with the
 * mounting point at its origin and the barrel resting along +X (K5, #362), so no offset lives here.
 *
 * `hull.front` (0.48, -0.08) is the point under the drill nose that #362's review renders hang
 * the gun at, low on the hull where a downward arc clears the body: my pick, as the TD named none.
 */
import { GUN_TURN_RADIANS_PER_SECOND } from '../../../../constants/scene'
import type { ArtCatalogue } from '../../../../systems/art/artCatalogue'
import { atlasMapsOf, type AssetQuad, type AtlasMaps } from '../../../../systems/art/assetLook'
import type { Pair } from '../../../../systems/art/partsSidecar'
import { boreDirectionOf } from '../../../../systems/authority/bore/boreAim'
import type { ArtAsset } from '../../../../systems/registries/artAssets'
import { attachOf, isAttachId, type AttachUse } from '../../../../systems/registries/vehicleAttach'
import { mountedPartQuadsOf, type PartMount } from '../../../../systems/render/mountedPartLook'
import { BORE_GUN_SCHEDULE_ROW } from '../boreGunContent'

export const BORE_GUN_ASSET_ID = 'vehicle-bore-gun'
export const BORE_MOUNT_PART_ID = 't1-bore-mount'
export const BORE_BARREL_PART_ID = 't1-bore-barrel'

/** The gun rides the `bore_gun` row's point, registered through the K5 attach registry. */
export const BORE_GUN_ATTACH_USE: AttachUse = {
  id: 'ground-gun.mount',
  itemId: BORE_GUN_SCHEDULE_ROW,
  attach: 'hull.front',
}

/** The rig's up in the bearing table's frame: a bearing's direction is then `(along, -down)`. */
const TABLE_UP = { x: 0, y: 1 }

/** The gun's saddle and barrel, split so the barrel turns about its trunnion. */
export interface BoreGunQuads {
  /** The saddle, in the vehicle's frame. */
  fixed: AssetQuad[]
  /** The barrel, centred on the trunnion so one group at `trunnion` turns it. */
  barrel: AssetQuad[]
  /** The barrel's pivot in the vehicle's frame. */
  trunnion: Pair
}

export function boreGunArtAssets(): ArtAsset[] {
  return [
    {
      id: BORE_GUN_ASSET_ID,
      category: 'vehicle',
      parts: [BORE_MOUNT_PART_ID, BORE_BARREL_PART_ID],
    },
  ]
}

/** The gun at the point its attach use registers; null while none places it. */
export function boreGunMountOf(): PartMount | null {
  const attachId = attachOf(BORE_GUN_ATTACH_USE.itemId)
  if (attachId === null || !isAttachId(attachId)) return null
  return { assetId: BORE_GUN_ASSET_ID, attachId }
}

export function boreGunQuadsOf(art: ArtCatalogue, mount: PartMount): BoreGunQuads {
  const quads = mountedPartQuadsOf(art, mount)
  const barrels = quads.filter(isBarrel)
  const trunnion = barrels[0]?.pivot ?? [0, 0]
  return {
    fixed: quads.filter((quad) => !isBarrel(quad)),
    barrel: barrels.map((quad) => relativeTo(quad, trunnion)),
    trunnion,
  }
}

export function boreGunMaps(art: ArtCatalogue): AtlasMaps | null {
  return atlasMapsOf(art, BORE_GUN_ASSET_ID)
}

/**
 * The barrel's turn from its rest along +X, radians in the vehicle's frame (+X its right-hand
 * tangent, +Y up), pointing along `bearing` of #313's table: 0 at the right horizontal, down
 * through -π/2 and round to -π at the left horizontal, so the turn never jumps across the arc.
 */
export function barrelTurnOf(bearing: number): number {
  const { x, y } = boreDirectionOf(TABLE_UP, bearing)
  const turn = Math.atan2(y, x)
  return turn > Math.PI / 2 ? turn - 2 * Math.PI : turn
}

/** The barrel's turn after `dtSeconds` of swinging towards `target` at the turret's rate. */
export function stepBarrelTurn(current: number, target: number, dtSeconds: number): number {
  const reach = GUN_TURN_RADIANS_PER_SECOND * dtSeconds
  const gap = target - current
  return Math.abs(gap) <= reach ? target : current + Math.sign(gap) * reach
}

function isBarrel(quad: AssetQuad): boolean {
  return quad.partId === BORE_BARREL_PART_ID
}

function relativeTo(quad: AssetQuad, [x, y]: Pair): AssetQuad {
  return {
    ...quad,
    centre: [quad.centre[0] - x, quad.centre[1] - y],
    pivot: [quad.pivot[0] - x, quad.pivot[1] - y],
  }
}
