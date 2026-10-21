/**
 * The parts a rig's looks swap in (#577, `partMotionRequests`): each owned step with a part asks
 * for it on its track's own attach point, and a fitted module, wagon or item drawn at that point
 * wins it whole (TD "module wins its slot"): the rig part is hidden there, not moved, and the base
 * part shows under the module. A step cut from a look asset of its own (ticket 640) names that
 * asset and the `vehicle` slot it hides; a `vehicle` step's request is the plain swap it always
 * was. Pure: the caller says which looks are owned and which points are taken; one request per
 * frame, made once and kept.
 */
import type { PartSwapRequest } from '../../../../systems/registries/partMotionRequests'
import { isAttachId } from '../../../../systems/registries/vehicleAttach'
import { VEHICLE_LOOK_ASSET_ID, type RigLookFrame } from './rigLookFrames'

const keptRequests = new Map<RigLookFrame, PartSwapRequest>()

/** The swaps the owned looks ask for, minus those on a taken point, in track order. */
export function partSwapsOf(
  owned: readonly RigLookFrame[],
  takenPoints: readonly string[],
): PartSwapRequest[] {
  return owned
    .filter((frame) => frame.partId !== null && !takenPoints.includes(frame.slot))
    .map(keptRequestOf)
}

/** Whether any owned look swaps a part in, before any point is taken. */
export function isSwappingParts(owned: readonly RigLookFrame[]): boolean {
  return owned.some((frame) => frame.partId !== null)
}

function keptRequestOf(frame: RigLookFrame): PartSwapRequest {
  const kept = keptRequests.get(frame) ?? requestOf(frame)
  keptRequests.set(frame, kept)
  return kept
}

function requestOf(frame: RigLookFrame): PartSwapRequest {
  if (frame.partId === null || !isAttachId(frame.slot)) throw new Error(`no part on ${frame.slot}`)
  const swap: PartSwapRequest = { kind: 'swap', attach: frame.slot, partIds: [frame.partId] }
  return isLookAssetPart(frame) ? withLookAsset(swap, frame) : swap
}

function isLookAssetPart(frame: RigLookFrame): boolean {
  return frame.assetId !== null && frame.assetId !== VEHICLE_LOOK_ASSET_ID
}

function withLookAsset(swap: PartSwapRequest, frame: RigLookFrame): PartSwapRequest {
  const assetId = frame.assetId ?? VEHICLE_LOOK_ASSET_ID
  if (frame.replacesSlot === null) return { ...swap, assetId }
  return { ...swap, assetId, replacesSlot: frame.replacesSlot }
}
