/**
 * One fixed step of the part motion slices ask for (`partMotionRequests`, #180): the pose added to
 * each part slot and the parts swapped in, folded from every source's requests. Kept across steps
 * and written in place, so a step allocates nothing once each slot has been seen; the swapped parts
 * carry a version that moves only when they change, so the drawn car rebuilds its parts only then.
 * Presentation only.
 */
import type { AttachId } from '../registries/vehicleAttach'
import type { PartMotionRequest, PartMotionRequestSource } from '../registries/partMotionRequests'

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
  /** The parts swapped in this step, sorted. */
  shownPartIds: string[]
  /** Moves each time `shownPartIds` changes. */
  shownVersion: number
  /** The attach points some request names this step, sorted: what a spec reads. */
  attach: AttachId[]
}

interface FoldScratch {
  shownPartIds: string[]
}

const scratch: FoldScratch = { shownPartIds: [] }

export function createRequestedParts(): RequestedParts {
  return { poses: new Map(), shownPartIds: [], shownVersion: 0, attach: [] }
}

/** Replaces last step's requests with what every source asks now. */
export function foldPartRequests(
  requested: RequestedParts,
  sources: readonly PartMotionRequestSource[],
): void {
  clearPoses(requested)
  requested.attach.length = 0
  scratch.shownPartIds.length = 0
  for (const source of sources) {
    for (const request of source.requestsNow()) foldRequest(requested, request)
  }
  requested.attach.sort()
  showSwappedParts(requested, scratch.shownPartIds.sort())
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
  if (request.kind === 'swap') appendAll(scratch.shownPartIds, request.partIds)
  else for (const slot of request.slots) addToSlot(requested, slot, request)
}

function appendAll(into: string[], ids: readonly string[]): void {
  for (const id of ids) into.push(id)
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
function showSwappedParts(requested: RequestedParts, shown: readonly string[]): void {
  if (isSameList(requested.shownPartIds, shown)) return
  requested.shownPartIds.length = 0
  appendAll(requested.shownPartIds, shown)
  requested.shownVersion++
}

function isSameList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let at = 0; at < a.length; at++) if (a[at] !== b[at]) return false
  return true
}
