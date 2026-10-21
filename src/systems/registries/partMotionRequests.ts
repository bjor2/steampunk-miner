/**
 * Part motion and model swaps a slice asks of the drawn car (#180 showcase reactions; K-b ticket
 * 227, TD lock on #177). A source answers, once per fixed step, the requests it has now, each at
 * one vehicle-attach point: a pose added to some of the car's part slots (an arm twists the bolt
 * on `drill.housing`), or parts swapped into their slots whatever the visual tier (a big level-up
 * shows `t3-drill-bit`). The slice eases its own reactions; `scene/partMotionPresence.ts` asks the
 * sources and stays the one writer of the car's part motion. Render-only, like vehicle attach: no
 * request enters the authority state, a snapshot or a digest. With no source the car moves and
 * looks exactly as before.
 */
import { defineRegistry, entriesOf } from './seal'
import type { AttachId } from './vehicleAttach'

/** Added to the motion of each slot it names, in the car's frame. */
export interface PartPoseRequest {
  kind: 'pose'
  attach: AttachId
  /** Part ids without their tier (`slotOfPartId`): `drill-bit`, `wheel-2`. */
  slots: readonly string[]
  /** Metres along the car's own x and y. */
  x: number
  y: number
  /** Radians about each part's own pivot. */
  angle: number
  /** Added to the part's glow, 1 being its own colour at full. */
  glow: number
}

/**
 * Each part drawn in its own slot, in place of what the visual tier shows there. A part of another
 * asset (the rig-look seam, ticket 640: `vehicle-look-boiler`) is drawn at `attach`'s point and
 * stands in place of the `vehicle` part slot it `replacesSlot`, hidden while it shows; an asset or
 * part the art lacks draws nothing and leaves the base part in place.
 */
export interface PartSwapRequest {
  kind: 'swap'
  attach: AttachId
  /** Part ids of `assetId`: `t3-drill-bit`, `t2-stack-2` on the `vehicle` asset. */
  partIds: readonly string[]
  /** The asset the parts come from; absent is `vehicle`, so the swap is exactly the old one. */
  assetId?: string
  /** For another asset's parts: the `vehicle` part slot (`boiler`) they hide; absent hides none. */
  replacesSlot?: string
}

/** The asset a swap with no `assetId` draws from: the base vehicle. */
export const BASE_SWAP_ASSET_ID = 'vehicle'

/** The asset `request`'s parts come from. */
export function swapAssetIdOf(request: PartSwapRequest): string {
  return request.assetId ?? BASE_SWAP_ASSET_ID
}

/** Whether `request` swaps parts of the base vehicle (the swaps before ticket 640). */
export function isBaseVehicleSwap(request: PartSwapRequest): boolean {
  return swapAssetIdOf(request) === BASE_SWAP_ASSET_ID
}

export type PartMotionRequest = PartPoseRequest | PartSwapRequest

export interface PartMotionRequestSource {
  id: string
  /** The requests now; asked once per fixed step, so return a kept array, not a new one. */
  requestsNow(): readonly PartMotionRequest[]
}

export const PART_MOTION_REQUEST_REGISTRY =
  defineRegistry<PartMotionRequestSource>('partMotionRequests')

/** Every source, sorted by id. */
export function partMotionRequestSources(): readonly PartMotionRequestSource[] {
  return entriesOf(PART_MOTION_REQUEST_REGISTRY)
}
