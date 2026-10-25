/**
 * The cover seam on part swaps (ticket 892, GD lock 6402021452 on #623, TD 6402023994): a look
 * swap may stand for the art of the items it covers, so one equipped thing never draws twice. One
 * pure resolver answers which items the showing swaps cover, and which points a swap still has to
 * yield ("module wins its slot") once the art of the items it covers is set aside. Render-only:
 * nothing here enters the authority state, a snapshot or a digest.
 */
import type { PartSwapRequest } from '../registries/partMotionRequests'

/** What a mount on the car holds a vehicle-attach point with: the items it is drawn for, if any. */
export interface PointHolder {
  attachId: string
  /** The items whose art the mount draws; none for a module's, a wagon's or a building's part. */
  itemIds: readonly string[]
}

const NO_COVERS: readonly string[] = []

/** The items `swap` covers; none for a swap that names no covers. */
export function coversOf(swap: PartSwapRequest): readonly string[] {
  return swap.covers ?? NO_COVERS
}

/** Whether `swap` covers at least one item. */
export function isCoveringSwap(swap: PartSwapRequest): boolean {
  return coversOf(swap).length > 0
}

/**
 * Every item the showing swaps cover, sorted, each once, written over `into` (kept by the fold so
 * a step allocates nothing) and returned.
 */
export function coveredItemIdsOf(swaps: readonly PartSwapRequest[], into: string[] = []): string[] {
  into.length = 0
  for (const swap of swaps) appendNew(into, coversOf(swap))
  return into.sort()
}

/**
 * Whether a mount at `attachId` draws something besides the art of `covers`' items: a part with
 * no item, or an item the swap does not stand for. Such a point the swap yields.
 */
export function isPointHeldBesides(
  holders: readonly PointHolder[],
  attachId: string,
  covers: readonly string[],
): boolean {
  return holders.some((holder) => holder.attachId === attachId && isHeldBesides(holder, covers))
}

function isHeldBesides(holder: PointHolder, covers: readonly string[]): boolean {
  if (holder.itemIds.length === 0) return true
  return holder.itemIds.some((itemId) => !covers.includes(itemId))
}

function appendNew(into: string[], itemIds: readonly string[]): void {
  for (const itemId of itemIds) if (!into.includes(itemId)) into.push(itemId)
}
