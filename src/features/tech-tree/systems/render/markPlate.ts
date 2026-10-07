/**
 * The brass Mark plate on each power-up cradle (#161 Systems: "the brass Mark plate on the cradle
 * steps up with every Mark", a gilded rim once Mastered; ticket 250). A Mark-bearing item in a
 * `powerup.n` slot gets a plate hung flush under what the cradle draws at its `hull.powerup.n`
 * point, with one rivet per Mark in rows of five, so the plate grows a row every fifth Mark. Its
 * place comes from the sidecar point and the housing's own quads, never an offset of its own.
 * Render-only.
 */
import { attachPointOf, type Pair, type PartsSidecar } from '../../../../systems/art/partsSidecar'
import { slotAttachPointOf } from '../../../../systems/registries/vehicleAttach'
import type { LoadoutSlotId } from '../../../../systems/registries/vehicleLoadout'
import { isMasteredAt } from '../markLadder'
import type { ItemUnlock } from '../techNode'
import { markBearerOfItem, type TechTree } from '../techTree'
import type { RigMount } from './rigGear'
import type { GearQuad, MountedItem } from './techGearQuads'

/**
 * Mark 1 is the item as bought (#162 4.6): power-up-core plays an item researched none of (owned
 * through a debug loadout) at Mark 1 (#249), so its plate shows Mark 1, never a Mark it does not
 * act at.
 */
export const BOUGHT_MARK = 1

/** A plate as wide as two cradle pitches leave room for; a row holds five rivets. */
const PLATE_WIDTH_M = 0.1
const ROW_HEIGHT_M = 0.022
const RIVETS_PER_ROW = 5
const RIVET_PITCH_M = 0.018

/** A Mark-bearing item in a cradle, at the Mark it acts at. */
export interface CradleMark {
  itemId: string
  slot: LoadoutSlotId
  mark: number
  isGilded: boolean
}

export interface MarkPlate extends CradleMark {
  /** The plate's centre in the vehicle's frame, metres. */
  centre: Pair
  size: Pair
  /** One per Mark, from the plate's centre, the top row first. */
  rivets: Pair[]
}

/** The Mark each item acts at: the highest researched, and Mark 1 for an item researched none of. */
export function actingMarksOf(
  items: readonly MountedItem[],
  unlocks: readonly ItemUnlock[],
): Record<string, number> {
  const researched = new Map(unlocks.map((unlock) => [unlock.itemId, unlock.mark]))
  return Object.fromEntries(
    items.map(({ itemId }) => [itemId, Math.max(researched.get(itemId) ?? 0, BOUGHT_MARK)]),
  )
}

/** The cradled items that bear Marks, each at `markOf` its Mark, gilded once Mastered there. */
export function cradleMarksOf(
  items: readonly MountedItem[],
  tree: TechTree,
  markOf: (itemId: string) => number,
): CradleMark[] {
  return items.flatMap((item) => {
    const ladder = markBearerOfItem(tree, item.itemId)?.ladder
    if (ladder === undefined || !isCradle(item.slot)) return []
    const mark = markOf(item.itemId)
    return [{ itemId: item.itemId, slot: item.slot, mark, isGilded: isMasteredAt(ladder, mark) }]
  })
}

/** Each cradle mark's plate, under its cradle's housing; none for a cradle the vehicle lacks. */
export function markPlatesOf(
  vehicle: PartsSidecar,
  mounts: readonly RigMount[],
  marks: readonly CradleMark[],
): MarkPlate[] {
  return marks.flatMap((cradleMark) => {
    const top = plateTopOf(vehicle, mounts, cradleMark.slot)
    return top === null ? [] : [plateOf(cradleMark, top)]
  })
}

function isCradle(slot: LoadoutSlotId | null): slot is LoadoutSlotId {
  return slot !== null && slotAttachPointOf(slot) !== null
}

/** The middle of the bottom edge of what the cradle draws, or its point when it draws nothing. */
function plateTopOf(vehicle: PartsSidecar, mounts: readonly RigMount[], slot: LoadoutSlotId) {
  const attachId = slotAttachPointOf(slot)
  const point = attachId === null ? null : attachPointOf(vehicle, attachId)
  if (point === null) return null
  const housing = mounts.filter((mount) => mount.attachId === attachId).flatMap((m) => m.quads)
  return housing.length === 0 ? point.atM : bottomMiddleOf(housing)
}

function bottomMiddleOf(quads: readonly GearQuad[]): Pair {
  const left = Math.min(...quads.map((quad) => quad.centre[0] - quad.size[0] / 2))
  const right = Math.max(...quads.map((quad) => quad.centre[0] + quad.size[0] / 2))
  const bottom = Math.min(...quads.map((quad) => quad.centre[1] - quad.size[1] / 2))
  return [(left + right) / 2, bottom]
}

function plateOf(cradleMark: CradleMark, [x, top]: Pair): MarkPlate {
  const height = rowsOf(cradleMark.mark) * ROW_HEIGHT_M
  return {
    ...cradleMark,
    centre: [x, top - height / 2],
    size: [PLATE_WIDTH_M, height],
    rivets: rivetsOf(cradleMark.mark, height),
  }
}

function rowsOf(mark: number): number {
  return Math.max(1, Math.ceil(mark / RIVETS_PER_ROW))
}

function rivetsOf(mark: number, height: number): Pair[] {
  return Array.from({ length: mark }, (_, at) => {
    const column = at % RIVETS_PER_ROW
    const row = Math.floor(at / RIVETS_PER_ROW)
    const middleColumn = (RIVETS_PER_ROW - 1) / 2
    return [(column - middleColumn) * RIVET_PITCH_M, height / 2 - (row + 1 / 2) * ROW_HEIGHT_M]
  })
}
