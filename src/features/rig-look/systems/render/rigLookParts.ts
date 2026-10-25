/**
 * The parts a rig's looks swap in (#577, `partMotionRequests`): each owned step with a part asks
 * for it on its track's own attach point, and a fitted module, wagon or item drawn at that point
 * wins it whole (TD "module wins its slot"): the rig part is hidden there, not moved, and the base
 * part shows under the module. A step cut from a look asset of its own (ticket 640) names that
 * asset and the `vehicle` slot it hides; a `vehicle` step's request is the plain swap it always
 * was. A track that covers items (ticket 892) carries them on its swap and does not yield a point
 * held only by their art, which steps aside while the swap shows. Pure: the caller says which
 * looks are owned and what holds each point; one request per frame, made once and kept.
 */
import type { PartSwapRequest } from '../../../../systems/registries/partMotionRequests'
import { isAttachId } from '../../../../systems/registries/vehicleAttach'
import { isPointHeldBesides, type PointHolder } from '../../../../systems/render/swapCovers'
import { VEHICLE_LOOK_ASSET_ID, type RigLookFrame } from './rigLookFrames'

const keptRequests = new Map<RigLookFrame, PartSwapRequest>()

/** The swaps the owned looks ask for, minus those whose point another mount holds, in track order. */
export function partSwapsOf(
  owned: readonly RigLookFrame[],
  holders: readonly PointHolder[],
): PartSwapRequest[] {
  return owned.filter((frame) => isSwapShown(frame, holders)).map(keptRequestOf)
}

/** Whether any owned look swaps a part in, before any point is taken. */
export function isSwappingParts(owned: readonly RigLookFrame[]): boolean {
  return owned.some((frame) => frame.partId !== null)
}

function isSwapShown(frame: RigLookFrame, holders: readonly PointHolder[]): boolean {
  return frame.partId !== null && !isPointHeldBesides(holders, frame.slot, frame.covers)
}

function keptRequestOf(frame: RigLookFrame): PartSwapRequest {
  const kept = keptRequests.get(frame) ?? requestOf(frame)
  keptRequests.set(frame, kept)
  return kept
}

function requestOf(frame: RigLookFrame): PartSwapRequest {
  if (frame.partId === null || !isAttachId(frame.slot)) throw new Error(`no part on ${frame.slot}`)
  const swap: PartSwapRequest = { kind: 'swap', attach: frame.slot, partIds: [frame.partId] }
  return withCovers(isLookAssetPart(frame) ? withLookAsset(swap, frame) : swap, frame)
}

/** Only a covering frame names covers, so every other swap stays exactly the old one. */
function withCovers(swap: PartSwapRequest, frame: RigLookFrame): PartSwapRequest {
  return frame.covers.length === 0 ? swap : { ...swap, covers: frame.covers }
}

function isLookAssetPart(frame: RigLookFrame): boolean {
  return frame.assetId !== null && frame.assetId !== VEHICLE_LOOK_ASSET_ID
}

function withLookAsset(swap: PartSwapRequest, frame: RigLookFrame): PartSwapRequest {
  const assetId = frame.assetId ?? VEHICLE_LOOK_ASSET_ID
  if (frame.replacesSlot === null) return { ...swap, assetId }
  return { ...swap, assetId, replacesSlot: frame.replacesSlot }
}
