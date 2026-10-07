/**
 * Where a mounted part draws on the vehicle (#235, the #166 seam; #162 TD sockets, K5 #188): an
 * asset's quads moved to the attach point the base vehicle's sidecar carries, so no offset lives
 * in code (TD acceptance 6 on #166). Each part keeps its own draw order, because the gear is
 * authored with the vehicle's draw orders (#166). Render-only: nothing here reaches the authority
 * state, a snapshot or a digest.
 */
import {
  exportedSidecarOf,
  manifestEntryOf,
  placeholderSidecarOf,
  type ArtCatalogue,
} from '../art/artCatalogue'
import { assetQuadsOf, type AssetQuad } from '../art/assetLook'
import { attachPointOf, type AttachPoint, type Pair } from '../art/partsSidecar'
import { ATTACH_ASSET_ID } from '../art/sidecarAttach'
import type { AttachId } from '../registries/vehicleAttach'

/** Mounted gear is authored untiered (#166): its one look. */
const MOUNTED_LOOK = 1

/** One asset hung at one vehicle attach point. */
export interface PartMount {
  assetId: string
  attachId: AttachId
}

/**
 * The point on the base vehicle, in metres from its origin: from the exported sidecar once the
 * vehicle is final, else from its placeholder; null when neither places it.
 */
export function vehicleAttachPointOf(art: ArtCatalogue, attachId: AttachId): AttachPoint | null {
  const isFinal = manifestEntryOf(art, ATTACH_ASSET_ID)?.status === 'final'
  const exported = isFinal ? exportedSidecarOf(art, ATTACH_ASSET_ID) : null
  const sidecar = exported ?? placeholderSidecarOf(art, ATTACH_ASSET_ID)
  return sidecar === null ? null : attachPointOf(sidecar, attachId)
}

/** The asset's quads in the vehicle's frame at its point; empty when the vehicle has no such point. */
export function mountedPartQuadsOf(art: ArtCatalogue, mount: PartMount): AssetQuad[] {
  const point = vehicleAttachPointOf(art, mount.attachId)
  if (point === null) return []
  return assetQuadsOf(art, mount.assetId, MOUNTED_LOOK).map((quad) => movedBy(quad, point.atM))
}

function movedBy(quad: AssetQuad, by: Pair): AssetQuad {
  return { ...quad, centre: shifted(quad.centre, by), pivot: shifted(quad.pivot, by) }
}

function shifted([x, y]: Pair, [dx, dy]: Pair): Pair {
  return [x + dx, y + dy]
}
