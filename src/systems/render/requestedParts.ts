/**
 * One fixed step of the part motion slices ask for (`partMotionRequests`, #180): the pose added to
 * each part slot and the parts swapped in, folded from every source's requests. Kept across steps
 * and written in place, so a step allocates nothing once each slot has been seen; the swapped parts
 * carry a version that moves only when they change, so the drawn car rebuilds its parts only then.
 * Swaps of another asset's parts (ticket 640) are kept apart as `shownLooks`, so a swap with no
 * `assetId` folds exactly as before. Presentation only.
 */
import type { AttachId } from '../registries/vehicleAttach'
import {
  isBaseVehicleSwap,
  swapAssetIdOf,
  type PartMotionRequest,
  type PartMotionRequestSource,
  type PartSwapRequest,
} from '../registries/partMotionRequests'

/** The pose a part slot is asked to add to its own motion. */
export interface RequestedPartPose {
  x: number
  y: number
  angle: number
  glow: number
}

export interface RequestedParts {
  /** By part slot; a slot nobody asks for this step holds zeros. */
  poses: Map<string, RequestedPartPose>
  /** The `vehicle` parts swapped in this step, sorted. */
  shownPartIds: string[]
  /** The swaps of another asset's parts this step, as their sources keep them, by point then asset. */
  shownLooks: PartSwapRequest[]
  /** Moves each time `shownPartIds` or `shownLooks` changes. */
  shownVersion: number
  /** The attach points some request names this step, sorted: what a spec reads. */
  attach: AttachId[]
}

interface FoldScratch {
  shownPartIds: string[]
  shownLooks: PartSwapRequest[]
}

const scratch: FoldScratch = { shownPartIds: [], shownLooks: [] }

export function createRequestedParts(): RequestedParts {
  return { poses: new Map(), shownPartIds: [], shownLooks: [], shownVersion: 0, attach: [] }
}

/** Replaces last step's requests with what every source asks now. */
export function foldPartRequests(
  requested: RequestedParts,
  sources: readonly PartMotionRequestSource[],
): void {
  clearPoses(requested)
  requested.attach.length = 0
  scratch.shownPartIds.length = 0
  scratch.shownLooks.length = 0
  for (const source of sources) {
    for (const request of source.requestsNow()) foldRequest(requested, request)
  }
  requested.attach.sort()
  showSwappedParts(
    requested,
    scratch.shownPartIds.sort(),
    scratch.shownLooks.sort(byPointThenAsset),
  )
}

function clearPoses(requested: RequestedParts): void {
  for (const pose of requested.poses.values()) {
    pose.x = 0
    pose.y = 0
    pose.angle = 0
    pose.glow = 0
  }
}

function foldRequest(requested: RequestedParts, request: PartMotionRequest): void {
  if (!requested.attach.includes(request.attach)) requested.attach.push(request.attach)
  if (request.kind === 'pose') for (const slot of request.slots) addToSlot(requested, slot, request)
  else if (isBaseVehicleSwap(request)) appendAll(scratch.shownPartIds, request.partIds)
  else scratch.shownLooks.push(request)
}

function appendAll<T>(into: T[], items: readonly T[]): void {
  for (const item of items) into.push(item)
}

function addToSlot(requested: RequestedParts, slot: string, add: RequestedPartPose): void {
  const pose = requested.poses.get(slot) ?? newSlotPose(requested, slot)
  pose.x += add.x
  pose.y += add.y
  pose.angle += add.angle
  pose.glow += add.glow
}

function newSlotPose(requested: RequestedParts, slot: string): RequestedPartPose {
  const pose = { x: 0, y: 0, angle: 0, glow: 0 }
  requested.poses.set(slot, pose)
  return pose
}

/** Copies the step's swaps in only when they differ, and then moves the version. */
function showSwappedParts(
  requested: RequestedParts,
  shown: readonly string[],
  looks: readonly PartSwapRequest[],
): void {
  const isSameParts = isSameList(requested.shownPartIds, shown, isSameId)
  if (isSameParts && isSameList(requested.shownLooks, looks, isSameLook)) return
  requested.shownPartIds.length = 0
  appendAll(requested.shownPartIds, shown)
  requested.shownLooks.length = 0
  appendAll(requested.shownLooks, looks)
  requested.shownVersion++
}

function isSameList<T>(a: readonly T[], b: readonly T[], isSame: (x: T, y: T) => boolean): boolean {
  if (a.length !== b.length) return false
  for (let at = 0; at < a.length; at++) if (!isSame(a[at], b[at])) return false
  return true
}

function isSameId(a: string, b: string): boolean {
  return a === b
}

/** Same asset, point, hidden slot and parts: a source that rebuilt its request moves nothing. */
function isSameLook(a: PartSwapRequest, b: PartSwapRequest): boolean {
  return (
    a === b ||
    (a.attach === b.attach &&
      swapAssetIdOf(a) === swapAssetIdOf(b) &&
      a.replacesSlot === b.replacesSlot &&
      isSameList(a.partIds, b.partIds, isSameId))
  )
}

function byPointThenAsset(a: PartSwapRequest, b: PartSwapRequest): number {
  return a.attach.localeCompare(b.attach) || swapAssetIdOf(a).localeCompare(swapAssetIdOf(b))
}
